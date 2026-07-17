"""Test fixtures: real app + real Postgres/Redis (docker compose must be up).

Isolation strategy: every test registers a brand-new user (unique email), so
tests never share state even against the shared dev database.
"""

import asyncio
import os
import sys
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, ".")
os.environ["ENV"] = "test"  # disables rate limiting (see app.rate_limit)

from app.main import app  # noqa: E402

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest_asyncio.fixture
async def anon() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def user_client() -> AsyncClient:
    """Client authenticated as a freshly registered user."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        email = f"t-{uuid.uuid4().hex[:12]}@test.replift.app"
        resp = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "test-password-1", "displayName": "Test User"},
        )
        assert resp.status_code == 200, resp.text
        # a goal is required for summaries/reports
        resp = await client.post("/api/v1/goals", json={
            "goalType": "maintain", "weeklyRateKg": 0, "calorieTarget": 2000,
            "proteinTargetG": 140, "carbsTargetG": 200, "fatTargetG": 60,
            "waterTargetMl": 3000, "effectiveDate": "2026-01-01",
        })
        assert resp.status_code == 201, resp.text
        yield client


def water_mutation(entry_id: str, key: str | None = None, date: str = "2026-07-17") -> dict:
    return {
        "idempotencyKey": key or uuid.uuid4().hex,
        "queuedAt": "2026-07-17T10:00:00Z",
        "attempts": 0,
        "mutation": {
            "op": "create",
            "entity": "diary_entry",
            "data": {
                "id": entry_id, "kind": "water", "date": date, "amountMl": 250,
                "loggedAt": "2026-07-17T10:00:00Z", "updatedAt": "2026-07-17T10:00:00Z",
                "revision": 0, "userId": "me", "deleted": False,
            },
        },
    }
