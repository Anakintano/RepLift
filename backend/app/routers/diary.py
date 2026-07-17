"""Diary reads + summaries + weekly reports (server-side computation)."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..domain.summary import compute_day_summary, compute_weekly_report
from ..models import DiaryEntry, Goal
from ..problems import Problem, not_found
from .sync import to_client_shape

router = APIRouter(tags=["diary"])

DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


async def _entries(db, user_id: str, start: str, end: str) -> list[dict]:
    rows = (await db.scalars(
        select(DiaryEntry).where(
            DiaryEntry.user_id == user_id,
            DiaryEntry.date >= start,
            DiaryEntry.date <= end,
            DiaryEntry.deleted.is_(False),
        ).order_by(DiaryEntry.logged_at)
    )).all()
    return [to_client_shape(e) for e in rows]


async def _current_goal(db, user_id: str) -> dict:
    goal = await db.scalar(
        select(Goal).where(Goal.user_id == user_id).order_by(Goal.effective_date.desc(), Goal.created_at.desc()).limit(1)
    )
    if not goal:
        raise not_found("Goal")
    return {
        "calorieTarget": goal.calorie_target,
        "proteinTargetG": goal.protein_target_g,
        "carbsTargetG": goal.carbs_target_g,
        "fatTargetG": goal.fat_target_g,
        "waterTargetMl": goal.water_target_ml,
    }


@router.get("/diary/{date}")
async def day(date: str, user: CurrentUser, db: DB):
    if len(date) != 10:
        raise Problem(422, "Invalid date", "Expected YYYY-MM-DD.")
    return await _entries(db, user.id, date, date)


@router.get("/diary")
async def range_(
    user: CurrentUser, db: DB,
    from_: str = Query(alias="from", pattern=DATE_RE),
    to: str = Query(pattern=DATE_RE),
):
    if to < from_:
        raise Problem(422, "Invalid range", "'to' must be on or after 'from'.")
    return await _entries(db, user.id, from_, to)


@router.get("/diary/{date}/summary")
async def summary(date: str, user: CurrentUser, db: DB):
    entries = await _entries(db, user.id, date, date)
    goal = await _current_goal(db, user.id)
    return compute_day_summary(date, entries, goal)


@router.get("/reports/weekly/{week_start}")
async def weekly(week_start: str, user: CurrentUser, db: DB):
    from ..domain.summary import add_days

    entries = await _entries(db, user.id, week_start, add_days(week_start, 6))
    goal = await _current_goal(db, user.id)
    return compute_weekly_report(week_start, entries, goal)
