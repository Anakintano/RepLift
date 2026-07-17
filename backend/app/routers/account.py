"""Account data rights: prefs, export (background job), deletion (two-phase)."""

from __future__ import annotations

import uuid
from pathlib import Path

from arq.connections import ArqRedis
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..config import get_settings
from ..deps import DB, CurrentUser
from ..models import AuditEvent, ExportJob, Pref, Session, User, utcnow
from ..observability import metrics
from ..problems import Problem, not_found
from ..schemas import DeleteAccountInput, ExportJobOut, NotificationPrefsIO, PrivacyIO
from ..security import clear_auth_cookies, verify_password

router = APIRouter(prefix="/account", tags=["account"])


def _job_pool(request: Request) -> ArqRedis:
    return request.app.state.arq


async def _get_pref(db, user_id: str, key: str, default: dict) -> dict:
    pref = await db.get(Pref, (user_id, key))
    return pref.value if pref else default


async def _set_pref(db, user_id: str, key: str, value: dict) -> None:
    pref = await db.get(Pref, (user_id, key))
    if pref:
        pref.value = value
    else:
        db.add(Pref(user_id=user_id, key=key, value=value))
    await db.commit()


@router.get("/notifications", response_model=NotificationPrefsIO)
async def get_notifications(user: CurrentUser, db: DB):
    return await _get_pref(db, user.id, "notifications", NotificationPrefsIO().model_dump(by_alias=True))


@router.put("/notifications", response_model=NotificationPrefsIO)
async def put_notifications(body: NotificationPrefsIO, user: CurrentUser, db: DB):
    await _set_pref(db, user.id, "notifications", body.model_dump(by_alias=True))
    return body


@router.get("/privacy", response_model=PrivacyIO)
async def get_privacy(user: CurrentUser, db: DB):
    return await _get_pref(db, user.id, "privacy", PrivacyIO().model_dump(by_alias=True))


@router.put("/privacy", response_model=PrivacyIO)
async def put_privacy(body: PrivacyIO, user: CurrentUser, db: DB):
    await _set_pref(db, user.id, "privacy", body.model_dump(by_alias=True))
    return body


def _job_out(job: ExportJob) -> ExportJobOut:
    return ExportJobOut(
        id=job.id, status=job.status, requested_at=job.requested_at, completed_at=job.completed_at,
        progress_pct=job.progress_pct,
        download_url=f"/api/v1/account/exports/{job.id}/download" if job.status == "done" else None,
    )


@router.post("/exports", response_model=ExportJobOut, status_code=202)
async def request_export(request: Request, user: CurrentUser, db: DB):
    job = ExportJob(id=uuid.uuid4().hex, user_id=user.id, status="queued")
    db.add(job)
    db.add(AuditEvent(id=uuid.uuid4().hex, user_id=user.id, event="account.export_requested", meta={}))
    await db.commit()
    await _job_pool(request).enqueue_job("export_user_data", job.id, _job_id=f"export:{job.id}")
    metrics.inc("export_requested")
    return _job_out(job)


@router.get("/exports/{job_id}", response_model=ExportJobOut)
async def export_status(job_id: str, user: CurrentUser, db: DB):
    job = await db.get(ExportJob, job_id)
    if not job or job.user_id != user.id:
        raise not_found("Export")
    return _job_out(job)


@router.get("/exports/{job_id}/download")
async def export_download(job_id: str, user: CurrentUser, db: DB):
    job = await db.get(ExportJob, job_id)
    if not job or job.user_id != user.id or job.status != "done" or not job.file_path:
        raise not_found("Export")
    path = Path(job.file_path)
    if not path.exists():
        raise Problem(410, "Export expired", "Request a new export.")
    return FileResponse(path, media_type="application/json", filename="replift-export.json")


@router.post("/delete", status_code=202)
async def delete_account(body: DeleteAccountInput, request: Request, user: CurrentUser, db: DB):
    """Two-phase deletion: credentials + sessions die NOW; a background job
    purges diary data, recipes, stats, exports. Audit row records the request."""
    if not verify_password(body.password, user.password_hash):
        raise Problem(403, "Password incorrect", "Account deletion requires your current password.")

    user_row = await db.get(User, user.id)
    user_row.deleted_at = utcnow()
    user_row.email = f"deleted:{user.id}"
    user_row.password_hash = "!"
    for s in (await db.scalars(select(Session).where(Session.user_id == user.id))).all():
        s.revoked_at = utcnow()
    db.add(AuditEvent(id=uuid.uuid4().hex, user_id=user.id, event="account.deletion_requested", meta={}))
    await db.commit()

    await _job_pool(request).enqueue_job("purge_account", user.id, _job_id=f"purge:{user.id}")
    metrics.inc("account_deletion")

    from fastapi import Response
    response = Response(status_code=202)
    clear_auth_cookies(response)
    return response
