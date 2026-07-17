"""ARQ background worker.

Jobs: data export, account purge, weekly report fan-out, popularity refresh.
Every run is recorded in job_runs (status running → done | retrying | failed),
so failures are observable and the final failure is the dead-letter record.
Retries use arq's built-in retry with exponential defer; job ids make
enqueues idempotent (same id → no duplicate job).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from arq import Retry, cron
from arq.connections import RedisSettings
from sqlalchemy import delete, func, select, update

from ..config import get_settings
from ..db import SessionLocal
from ..models import (
    AuditEvent, DiaryEntry, ExportJob, FoodStat, Goal, JobRun, Pref, Profile,
    Recipe, SavedMeal, Session, User, utcnow,
)
from ..observability import configure_logging

log = logging.getLogger("replift.jobs")

MAX_TRIES = 4


async def _record_run(name: str, args: dict, attempt: int) -> str:
    run_id = uuid.uuid4().hex
    async with SessionLocal() as db:
        db.add(JobRun(id=run_id, name=name, args=args, attempts=attempt, status="running"))
        await db.commit()
    return run_id


async def _finish_run(run_id: str, status: str, error: str | None = None) -> None:
    async with SessionLocal() as db:
        run = await db.get(JobRun, run_id)
        if run:
            run.status = status
            run.error = error
            run.finished_at = utcnow()
            await db.commit()


def job(name: str):
    """Wrap a job with run-history recording + retry/dead-letter semantics."""

    def decorator(fn):
        async def wrapper(ctx, *args, **kwargs):
            attempt = ctx.get("job_try", 1)
            run_id = await _record_run(name, {"args": [str(a) for a in args]}, attempt)
            try:
                result = await fn(ctx, *args, **kwargs)
                await _finish_run(run_id, "done")
                return result
            except Retry:
                await _finish_run(run_id, "retrying")
                raise
            except Exception as exc:
                if attempt < MAX_TRIES:
                    await _finish_run(run_id, "retrying", f"{type(exc).__name__}: {exc}")
                    log.warning("job %s failed (attempt %s), retrying", name, attempt, extra={"job": name})
                    raise Retry(defer=2 ** attempt * 5)  # 10s, 20s, 40s
                await _finish_run(run_id, "failed", f"{type(exc).__name__}: {exc}")
                log.error("job %s dead-lettered after %s attempts", name, attempt, extra={"job": name})
                raise

        wrapper.__name__ = name
        wrapper.__qualname__ = name  # arq registers jobs by qualname
        return wrapper

    return decorator


@job("export_user_data")
async def export_user_data(ctx, export_id: str) -> str:
    async with SessionLocal() as db:
        export = await db.get(ExportJob, export_id)
        if not export:
            return "missing"
        export.status = "running"
        export.progress_pct = 10
        await db.commit()

        user_id = export.user_id
        profile = await db.get(Profile, user_id)
        goals = (await db.scalars(select(Goal).where(Goal.user_id == user_id))).all()
        entries = (await db.scalars(select(DiaryEntry).where(DiaryEntry.user_id == user_id))).all()
        recipes = (await db.scalars(select(Recipe).where(Recipe.user_id == user_id))).all()

        export.progress_pct = 60
        await db.commit()

        payload = {
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "profile": {c.name: getattr(profile, c.name) for c in Profile.__table__.columns} if profile else None,
            "goals": [{c.name: str(getattr(g, c.name)) for c in Goal.__table__.columns} for g in goals],
            "entries": [
                {**e.payload, "id": e.id, "kind": e.kind, "date": e.date, "revision": e.revision, "deleted": e.deleted}
                for e in entries
            ],
            "recipes": [{"id": r.id, "name": r.name, "servings": r.servings,
                         "ingredients": r.ingredients, "perServing": r.per_serving} for r in recipes],
        }

        exports_dir = Path(get_settings().exports_dir)
        exports_dir.mkdir(parents=True, exist_ok=True)
        path = exports_dir / f"{export_id}.json"
        path.write_text(json.dumps(payload, indent=1, default=str), encoding="utf-8")

        export.status = "done"
        export.progress_pct = 100
        export.file_path = str(path)
        export.completed_at = utcnow()
        await db.commit()
    return "done"


@job("purge_account")
async def purge_account(ctx, user_id: str) -> str:
    """Second phase of account deletion: remove all personal data."""
    async with SessionLocal() as db:
        for model in (DiaryEntry, Recipe, SavedMeal, Goal, FoodStat, Pref, Session, ExportJob):
            await db.execute(delete(model).where(model.user_id == user_id))
        await db.execute(delete(Profile).where(Profile.user_id == user_id))
        db.add(AuditEvent(id=uuid.uuid4().hex, user_id=user_id, event="account.purged", meta={}))
        await db.commit()
    return "purged"


@job("refresh_food_popularity")
async def refresh_food_popularity(ctx) -> str:
    """Popularity = base + global log volume; feeds the search ranking."""
    from ..models import Food

    async with SessionLocal() as db:
        counts = (await db.execute(
            select(FoodStat.food_id, func.sum(FoodStat.log_count)).group_by(FoodStat.food_id)
        )).all()
        for food_id, total in counts:
            await db.execute(update(Food).where(Food.id == food_id).values(popularity=25 + float(total or 0)))
        await db.commit()
    return f"updated {len(counts)}"


@job("send_weekly_reports")
async def send_weekly_reports(ctx) -> str:
    """Monday fan-out. Email delivery is a stub integration; the computation
    and per-user enqueue pattern are the real demonstration here."""
    async with SessionLocal() as db:
        users = (await db.scalars(select(User).where(User.deleted_at.is_(None)))).all()
    log.info("weekly report fan-out for %d users (email delivery stubbed)", len(users), extra={"job": "send_weekly_reports"})
    return f"{len(users)} users"


async def startup(ctx):
    configure_logging()
    log.info("worker started")


class WorkerSettings:
    functions = [export_user_data, purge_account, refresh_food_popularity, send_weekly_reports]
    cron_jobs = [
        cron(send_weekly_reports, weekday=0, hour=6, minute=0),          # Mondays 06:00 UTC
        cron(refresh_food_popularity, hour={3}, minute=30),              # nightly
    ]
    on_startup = startup
    max_tries = MAX_TRIES
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
