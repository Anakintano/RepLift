"""Sync: batched diary mutations with idempotency + optimistic concurrency.

Per mutation, inside one transaction:
1. INSERT the idempotency key; a unique-key hit means this mutation was
   already applied — return the stored result (status becomes 'duplicate').
2. Apply create/update/delete with revision checks:
   - create: same id resent → duplicate (client UUIDs make retries safe)
   - update/delete: base_revision != current revision → 'conflict', return
     the server copy so the client can offer resolution. Nothing is merged
     silently.
3. Deletes are tombstones (revision bump) so other devices converge.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..deps import DB, CurrentUser
from ..models import DiaryEntry, FoodStat, IdempotencyKey, utcnow
from ..observability import metrics
from ..schemas import SyncPushIn, SyncPushResponseOut, SyncPushResultOut

router = APIRouter(prefix="/sync", tags=["sync"])

# fields that live as real columns, not in the JSONB payload
COLUMN_FIELDS = {"id", "userId", "kind", "date", "revision", "deleted", "updatedAt", "syncState"}


def to_client_shape(e: DiaryEntry) -> dict:
    return {
        **e.payload,
        "id": e.id,
        "userId": e.user_id,
        "kind": e.kind,
        "date": e.date,
        "revision": e.revision,
        "deleted": e.deleted,
        "updatedAt": e.updated_at.isoformat().replace("+00:00", "Z"),
    }


def _payload_of(data: dict) -> dict:
    return {k: v for k, v in data.items() if k not in COLUMN_FIELDS and v is not None}


async def _bump_food_stat(db, user_id: str, food_id: str) -> None:
    stmt = pg_insert(FoodStat).values(user_id=user_id, food_id=food_id, log_count=1, last_logged_at=utcnow())
    stmt = stmt.on_conflict_do_update(
        index_elements=[FoodStat.user_id, FoodStat.food_id],
        set_={"log_count": FoodStat.log_count + 1, "last_logged_at": utcnow()},
    )
    await db.execute(stmt)


@router.post("/push", response_model=SyncPushResponseOut)
async def push(body: SyncPushIn, user: CurrentUser, db: DB):
    results: list[SyncPushResultOut] = []

    for qm in body.mutations:
        m = qm.mutation

        # 1) idempotency gate — atomic insert-or-detect
        ins = pg_insert(IdempotencyKey).values(
            key=qm.idempotency_key, user_id=user.id, result={}
        ).on_conflict_do_nothing(index_elements=[IdempotencyKey.key])
        inserted = (await db.execute(ins)).rowcount
        if not inserted:
            existing = await db.get(IdempotencyKey, qm.idempotency_key)
            stored = existing.result if existing and existing.user_id == user.id else {}
            metrics.inc("sync_duplicate")
            results.append(SyncPushResultOut(
                idempotency_key=qm.idempotency_key, status="duplicate",
                new_revision=stored.get("newRevision"), server_entry=stored.get("serverEntry"),
            ))
            continue

        # 2) apply
        result = await _apply(db, user.id, qm.idempotency_key, m)
        key_row = await db.get(IdempotencyKey, qm.idempotency_key)
        key_row.result = result.model_dump(by_alias=True, exclude_none=True)
        results.append(result)

    await db.commit()
    return SyncPushResponseOut(
        results=results,
        server_time=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


async def _apply(db, user_id: str, key: str, m) -> SyncPushResultOut:
    now = utcnow()

    if m.op == "create":
        data = m.data or {}
        entry_id = data.get("id")
        if not entry_id or not data.get("kind") or not data.get("date"):
            return SyncPushResultOut(idempotency_key=key, status="rejected", error="Malformed entry")
        existing = await db.get(DiaryEntry, entry_id)
        if existing:
            if existing.user_id != user_id:
                return SyncPushResultOut(idempotency_key=key, status="rejected", error="Entry not found")
            metrics.inc("sync_duplicate")
            return SyncPushResultOut(idempotency_key=key, status="duplicate", new_revision=existing.revision)
        entry = DiaryEntry(
            id=entry_id, user_id=user_id, kind=data["kind"], date=data["date"],
            revision=1, deleted=False, payload=_payload_of(data),
            logged_at=datetime.fromisoformat(data.get("loggedAt", now.isoformat()).replace("Z", "+00:00")),
            updated_at=now,
        )
        db.add(entry)
        if data["kind"] == "food" and data.get("foodId"):
            await _bump_food_stat(db, user_id, data["foodId"])
        metrics.inc("sync_applied")
        return SyncPushResultOut(idempotency_key=key, status="applied", new_revision=1)

    # update / delete need an existing, owned entry
    entry = await db.get(DiaryEntry, m.id or "")
    if not entry or entry.user_id != user_id or (entry.deleted and m.op == "update"):
        return SyncPushResultOut(idempotency_key=key, status="rejected", error="Entry not found")

    if entry.revision != (m.base_revision or 0):
        metrics.inc("sync_conflict")
        return SyncPushResultOut(idempotency_key=key, status="conflict", server_entry=to_client_shape(entry))

    if m.op == "update":
        data = m.data or {}
        entry.payload = {**entry.payload, **_payload_of(data)}
        if "date" in data and data["date"]:
            entry.date = data["date"]
        entry.revision += 1
        entry.updated_at = now
        metrics.inc("sync_applied")
        return SyncPushResultOut(idempotency_key=key, status="applied", new_revision=entry.revision)

    entry.deleted = True
    entry.revision += 1
    entry.updated_at = now
    metrics.inc("sync_applied")
    return SyncPushResultOut(idempotency_key=key, status="applied", new_revision=entry.revision)
