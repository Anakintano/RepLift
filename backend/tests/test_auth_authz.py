"""Auth flow + ownership checks."""

import uuid

import pytest

pytestmark = pytest.mark.asyncio


async def test_register_login_me_logout(anon):
    email = f"t-{uuid.uuid4().hex[:12]}@test.replift.app"
    r = await anon.post("/api/v1/auth/register", json={"email": email, "password": "test-password-1", "displayName": "Flow"})
    assert r.status_code == 200
    assert (await anon.get("/api/v1/auth/me")).json()["email"] == email

    await anon.post("/api/v1/auth/logout")
    assert (await anon.get("/api/v1/auth/me")).json() is None

    r = await anon.post("/api/v1/auth/login", json={"email": email, "password": "test-password-1"})
    assert r.status_code == 200

    r = await anon.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
    assert r.status_code == 401


async def test_duplicate_email_409_with_field_error(anon):
    email = f"t-{uuid.uuid4().hex[:12]}@test.replift.app"
    await anon.post("/api/v1/auth/register", json={"email": email, "password": "test-password-1", "displayName": "Alpha"})
    r = await anon.post("/api/v1/auth/register", json={"email": email, "password": "test-password-2", "displayName": "Bravo"})
    assert r.status_code == 409
    assert "email" in r.json()["detail"]["errors"]


async def test_refresh_rotates_token(anon):
    email = f"t-{uuid.uuid4().hex[:12]}@test.replift.app"
    await anon.post("/api/v1/auth/register", json={"email": email, "password": "test-password-1", "displayName": "Rot"})
    old_refresh = anon.cookies.get("rl_refresh")
    r = await anon.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    assert anon.cookies.get("rl_refresh") != old_refresh  # rotated


async def test_protected_routes_require_auth(anon):
    for path in ("/api/v1/profile", "/api/v1/diary/2026-07-17", "/api/v1/recipes", "/api/v1/account/privacy"):
        assert (await anon.get(path)).status_code == 401, path


async def test_cross_user_recipe_access_denied(user_client, anon):
    # user A creates a recipe from a seeded food
    search = (await user_client.get("/api/v1/foods/search", params={"q": "banana"})).json()
    food = search["items"][0]["food"]
    r = await user_client.post("/api/v1/recipes", json={
        "name": "A's secret shake", "servings": 1,
        "ingredients": [{"id": "i1", "foodId": food["id"], "foodVersion": food["version"],
                          "foodName": food["name"], "quantity": 118, "unitId": "g", "grams": 118}],
    })
    assert r.status_code == 201
    recipe_id = r.json()["id"]

    # user B (fresh) cannot see it
    email = f"t-{uuid.uuid4().hex[:12]}@test.replift.app"
    await anon.post("/api/v1/auth/register", json={"email": email, "password": "test-password-1", "displayName": "Bravo"})
    assert (await anon.get(f"/api/v1/recipes/{recipe_id}")).status_code == 404
    assert all(rec["id"] != recipe_id for rec in (await anon.get("/api/v1/recipes")).json())


async def test_search_typo_ranks_target_first(user_client):
    r = await user_client.get("/api/v1/foods/search", params={"q": "chiken brest"})
    items = r.json()["items"]
    assert items, "no results for typo query"
    assert items[0]["food"]["id"] == "food-chicken-breast"
    assert items[0]["explain"]["fuzzy"] is True
