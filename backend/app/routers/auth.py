"""Auth: register, login, refresh rotation, logout, sessions. Rate-limited."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..models import AuditEvent, Profile, Session, User, utcnow
from ..observability import metrics
from ..problems import Problem, unauthorized
from ..rate_limit import rate_limit
from ..schemas import (
    AuthResponse,
    AuthTokensOut,
    LoginInput,
    PasswordResetInput,
    RegisterInput,
    SessionOut,
    UserOut,
)
from ..security import (
    REFRESH_COOKIE,
    clear_auth_cookies,
    hash_password,
    hash_refresh_token,
    make_access_token,
    new_refresh_token,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _device_of(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    if "Windows" in ua:
        return "Chrome on Windows" if "Chrome" in ua else "Browser on Windows"
    if "iPhone" in ua:
        return "iPhone"
    if "Android" in ua:
        return "Android"
    if "Mac" in ua:
        return "Browser on macOS"
    return "Unknown device"


async def _audit(db, user_id: str | None, event: str, **meta) -> None:
    db.add(AuditEvent(id=uuid.uuid4().hex, user_id=user_id, event=event, meta=meta))


async def _issue_session(db, request: Request, response: Response, user: User) -> AuthResponse:
    refresh = new_refresh_token()
    session = Session(
        id=uuid.uuid4().hex,
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh),
        device=_device_of(request),
        ip=request.client.host if request.client else "",
    )
    db.add(session)
    await db.flush()
    access, expires = make_access_token(user.id, session.id)
    set_auth_cookies(response, access, refresh)
    return AuthResponse(
        user=UserOut.model_validate(user),
        tokens=AuthTokensOut(access_token=access, expires_at=expires),
    )


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterInput, request: Request, response: Response, db: DB):
    await rate_limit(request, "register", limit=10, window_seconds=3600)
    email = body.email.lower().strip()
    if await db.scalar(select(User).where(User.email == email)):
        raise Problem(409, "Email already registered", "Try logging in instead.",
                      {"email": "This email already has an account."})
    user = User(
        id=uuid.uuid4().hex,
        email=email,
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()  # user row must exist before FK'd profile/session rows
    db.add(Profile(user_id=user.id))  # placeholder until onboarding completes
    await _audit(db, user.id, "account.registered")
    result = await _issue_session(db, request, response, user)
    await db.commit()
    metrics.inc("auth_register")
    return result


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginInput, request: Request, response: Response, db: DB):
    await rate_limit(request, "login", limit=20, window_seconds=900)
    user = await db.scalar(select(User).where(User.email == body.email.lower().strip(), User.deleted_at.is_(None)))
    if not user or not verify_password(body.password, user.password_hash):
        metrics.inc("auth_login_failed")
        raise Problem(401, "Invalid credentials", "Email or password is incorrect.")
    await _audit(db, user.id, "account.login")
    result = await _issue_session(db, request, response, user)
    await db.commit()
    metrics.inc("auth_login")
    return result


@router.post("/refresh", response_model=AuthResponse)
async def refresh(request: Request, response: Response, db: DB):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise unauthorized("No refresh token.")
    session = await db.scalar(
        select(Session).where(Session.refresh_token_hash == hash_refresh_token(token), Session.revoked_at.is_(None))
    )
    if not session:
        raise unauthorized("Session expired or revoked.")
    user = await db.scalar(select(User).where(User.id == session.user_id, User.deleted_at.is_(None)))
    if not user:
        raise unauthorized()

    # rotation: new refresh token replaces the old one atomically
    new_token = new_refresh_token()
    session.refresh_token_hash = hash_refresh_token(new_token)
    session.last_active_at = utcnow()
    access, expires = make_access_token(user.id, session.id)
    set_auth_cookies(response, access, new_token)
    await db.commit()
    return AuthResponse(user=UserOut.model_validate(user), tokens=AuthTokensOut(access_token=access, expires_at=expires))


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DB):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        session = await db.scalar(select(Session).where(Session.refresh_token_hash == hash_refresh_token(token)))
        if session:
            session.revoked_at = utcnow()
            await db.commit()
    clear_auth_cookies(response)


@router.post("/password-reset", status_code=202)
async def request_password_reset(body: PasswordResetInput, request: Request, db: DB):
    """Always 202 — never reveals whether the email exists."""
    await rate_limit(request, "pwreset", limit=5, window_seconds=3600)
    user = await db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if user:
        await _audit(db, user.id, "account.password_reset_requested")
        await db.commit()
        # Phase-2 note: email delivery is a stubbed integration; the reset
        # token flow lands with a real email provider.
    return {"status": "accepted"}


@router.get("/me", response_model=UserOut | None)
async def me(request: Request, db: DB):
    from ..deps import _token_from_request
    from ..security import decode_access_token

    token = _token_from_request(request)
    payload = decode_access_token(token) if token else None
    if not payload:
        return None
    return await db.scalar(select(User).where(User.id == payload["sub"], User.deleted_at.is_(None)))


@router.get("/sessions", response_model=list[SessionOut])
async def sessions(request: Request, user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None)).order_by(Session.last_active_at.desc())
    )).all()
    current_sid = getattr(request.state, "session_id", None)
    return [
        SessionOut(
            id=s.id, device=s.device, ip=s.ip, last_active_at=s.last_active_at,
            created_at=s.created_at, current=s.id == current_sid,
        )
        for s in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: str, request: Request, user: CurrentUser, db: DB):
    if session_id == getattr(request.state, "session_id", None):
        raise Problem(400, "Cannot revoke current session", "Log out instead.")
    session = await db.scalar(select(Session).where(Session.id == session_id, Session.user_id == user.id))
    if session:
        session.revoked_at = utcnow()
        await _audit(db, user.id, "account.session_revoked", session_id=session_id)
        await db.commit()
