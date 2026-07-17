"""Password hashing (argon2id), JWT access tokens, refresh-token rotation."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Response

from .config import get_settings

_ph = PasswordHasher()

ACCESS_COOKIE = "rl_access"
REFRESH_COOKIE = "rl_refresh"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def make_access_token(user_id: str, session_id: str) -> tuple[str, datetime]:
    s = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=s.access_token_minutes)
    token = jwt.encode(
        {"sub": user_id, "sid": session_id, "exp": expires, "type": "access"},
        s.jwt_secret,
        algorithm="HS256",
    )
    return token, expires


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        return payload if payload.get("type") == "access" else None
    except jwt.PyJWTError:
        return None


def new_refresh_token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex


def hash_refresh_token(token: str) -> str:
    """Refresh tokens are opaque; store only a fast one-way hash."""
    return hashlib.sha256(f"rl:{token}".encode()).hexdigest()


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    s = get_settings()
    secure = s.env == "production"
    response.set_cookie(
        ACCESS_COOKIE, access,
        max_age=s.access_token_minutes * 60, httponly=True, samesite="lax", secure=secure, path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh,
        max_age=s.refresh_token_days * 86400, httponly=True, samesite="lax", secure=secure,
        path="/api/v1/auth",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
