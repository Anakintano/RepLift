"""Sync correctness: idempotency, duplicate ids, conflicts, tombstones, ownership."""

import uuid

import pytest

from .conftest import water_mutation

pytestmark = pytest.mark.asyncio


async def push(client, mutations):
    resp = await client.post("/api/v1/sync/push", json={"mutations": mutations})
    assert resp.status_code == 200, resp.text
    return resp.json()["results"]


async def test_create_then_replay_is_idempotent(user_client):
    entry_id, key = uuid.uuid4().hex, uuid.uuid4().hex

    first = await push(user_client, [water_mutation(entry_id, key)])
    assert first[0]["status"] == "applied"
    assert first[0]["newRevision"] == 1

    replay = await push(user_client, [water_mutation(entry_id, key)])
    assert replay[0]["status"] == "duplicate"

    day = (await user_client.get("/api/v1/diary/2026-07-17")).json()
    assert len([e for e in day if e["id"] == entry_id]) == 1


async def test_same_entry_id_new_key_still_no_duplicate_row(user_client):
    """Client resends after losing its outbox: same entry id, fresh key."""
    entry_id = uuid.uuid4().hex
    await push(user_client, [water_mutation(entry_id)])
    second = await push(user_client, [water_mutation(entry_id)])
    assert second[0]["status"] == "duplicate"

    day = (await user_client.get("/api/v1/diary/2026-07-17")).json()
    assert len([e for e in day if e["id"] == entry_id]) == 1


async def test_stale_update_conflicts_and_returns_server_copy(user_client):
    entry_id = uuid.uuid4().hex
    await push(user_client, [water_mutation(entry_id)])

    ok = await push(user_client, [{
        "idempotencyKey": uuid.uuid4().hex, "queuedAt": "2026-07-17T10:01:00Z", "attempts": 0,
        "mutation": {"op": "update", "entity": "diary_entry", "id": entry_id,
                     "baseRevision": 1, "data": {"amountMl": 500}},
    }])
    assert ok[0]["status"] == "applied" and ok[0]["newRevision"] == 2

    stale = await push(user_client, [{
        "idempotencyKey": uuid.uuid4().hex, "queuedAt": "2026-07-17T10:02:00Z", "attempts": 0,
        "mutation": {"op": "update", "entity": "diary_entry", "id": entry_id,
                     "baseRevision": 1, "data": {"amountMl": 100}},
    }])
    assert stale[0]["status"] == "conflict"
    assert stale[0]["serverEntry"]["amountMl"] == 500
    assert stale[0]["serverEntry"]["revision"] == 2


async def test_delete_is_tombstone_and_leaves_day_reads(user_client):
    entry_id = uuid.uuid4().hex
    await push(user_client, [water_mutation(entry_id)])
    res = await push(user_client, [{
        "idempotencyKey": uuid.uuid4().hex, "queuedAt": "2026-07-17T10:03:00Z", "attempts": 0,
        "mutation": {"op": "delete", "entity": "diary_entry", "id": entry_id, "baseRevision": 1},
    }])
    assert res[0]["status"] == "applied"
    day = (await user_client.get("/api/v1/diary/2026-07-17")).json()
    assert not any(e["id"] == entry_id for e in day)


async def test_cannot_mutate_another_users_entry(user_client, anon):
    entry_id = uuid.uuid4().hex
    await push(user_client, [water_mutation(entry_id)])

    # second, different user
    import uuid as _uuid
    email = f"t-{_uuid.uuid4().hex[:12]}@test.replift.app"
    await anon.post("/api/v1/auth/register",
                    json={"email": email, "password": "test-password-1", "displayName": "Other"})
    res = await push(anon, [{
        "idempotencyKey": _uuid.uuid4().hex, "queuedAt": "2026-07-17T10:04:00Z", "attempts": 0,
        "mutation": {"op": "update", "entity": "diary_entry", "id": entry_id,
                     "baseRevision": 1, "data": {"amountMl": 999}},
    }])
    assert res[0]["status"] == "rejected"

    # owner's entry untouched
    day = (await user_client.get("/api/v1/diary/2026-07-17")).json()
    mine = next(e for e in day if e["id"] == entry_id)
    assert mine["amountMl"] == 250


async def test_summary_reflects_synced_entries(user_client):
    await push(user_client, [water_mutation(uuid.uuid4().hex, date="2026-07-18")])
    summary = (await user_client.get("/api/v1/diary/2026-07-18/summary")).json()
    assert summary["waterMl"] == 250
    assert summary["remainingKcal"] == 2000
