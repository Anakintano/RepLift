"""Profile + versioned goals."""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..models import Goal, Profile
from ..problems import not_found
from ..schemas import GoalIn, GoalOut, ProfileOut, ProfilePatch

router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=ProfileOut)
async def get_profile(user: CurrentUser, db: DB):
    profile = await db.get(Profile, user.id)
    if not profile:
        raise not_found("Profile")
    return profile


@router.patch("/profile", response_model=ProfileOut)
async def update_profile(patch: ProfilePatch, user: CurrentUser, db: DB):
    profile = await db.get(Profile, user.id)
    if not profile:
        profile = Profile(user_id=user.id)
        db.add(profile)
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/goals/current", response_model=GoalOut)
async def current_goal(user: CurrentUser, db: DB):
    goal = await db.scalar(
        select(Goal).where(Goal.user_id == user.id).order_by(Goal.effective_date.desc(), Goal.created_at.desc()).limit(1)
    )
    if not goal:
        raise not_found("Goal")
    return goal


@router.get("/goals", response_model=list[GoalOut])
async def goal_history(user: CurrentUser, db: DB):
    return (await db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.effective_date.desc()))).all()


@router.post("/goals", response_model=GoalOut, status_code=201)
async def create_goal(body: GoalIn, user: CurrentUser, db: DB):
    goal = Goal(id=uuid.uuid4().hex, user_id=user.id, **body.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal
