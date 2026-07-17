"""Request dependencies: DB session, current user (cookie or bearer JWT)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import User
from .problems import unauthorized
from .security import ACCESS_COOKIE, decode_access_token

DB = Annotated[AsyncSession, Depends(get_db)]


def _token_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:]
    return request.cookies.get(ACCESS_COOKIE)


async def get_current_user(request: Request, db: DB) -> User:
    token = _token_from_request(request)
    if not token:
        raise unauthorized()
    payload = decode_access_token(token)
    if not payload:
        raise unauthorized("Session expired — please log in again.")
    user = await db.scalar(select(User).where(User.id == payload["sub"], User.deleted_at.is_(None)))
    if not user:
        raise unauthorized()
    request.state.user_id = user.id
    request.state.session_id = payload.get("sid")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
