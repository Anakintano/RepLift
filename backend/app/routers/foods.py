"""Food catalog: search, get, create (user foods), recent/frequent."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..models import Food, FoodStat, FoodVersion
from ..observability import metrics
from ..problems import not_found
from ..schemas import FoodCreate, FoodOut, FoodSearchResultOut, PageOut, SearchExplain
from ..search import search_food_ids

router = APIRouter(prefix="/foods", tags=["foods"])


async def food_out(db, food: Food, version: int | None = None) -> FoodOut:
    v = await db.get(FoodVersion, (food.id, version or food.current_version))
    if not v:
        raise not_found("Food version")
    return FoodOut(
        id=food.id, version=v.version, name=food.name, brand=food.brand, source=food.source,
        verification=food.verification, nutrients=v.nutrients, is_liquid=food.is_liquid,
        serving_units=v.serving_units, default_serving=v.default_serving,
        created_by=food.created_by, created_at=food.created_at,
    )


@router.get("/search", response_model=PageOut)
async def search(
    user: CurrentUser, db: DB,
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50, alias="pageSize"),
):
    if len(q.strip()) < 2:
        return PageOut(items=[], total=0, page=page, page_size=page_size, has_more=False)

    metrics.inc("food_search")
    rows, total = await search_food_ids(db, user.id, q, page, page_size)
    foods = {f.id: f for f in (await db.scalars(select(Food).where(Food.id.in_([r["id"] for r in rows])))).all()}

    items: list[dict[str, Any]] = []
    for row in rows:
        food = foods.get(row["id"])
        if not food:
            continue
        out = await food_out(db, food)
        items.append(
            FoodSearchResultOut(
                food=out,
                score=float(row["score"]),
                explain=SearchExplain(
                    text_score=float(row["text_score"]),
                    popularity_boost=float(row["popularity_boost"]),
                    personal_boost=float(row["personal_boost"]),
                    fuzzy=bool(row["fuzzy"]),
                ),
            ).model_dump(by_alias=True)
        )
    return PageOut(items=items, total=total, page=page, page_size=page_size, has_more=page * page_size < total)


@router.get("/recent", response_model=list[FoodOut])
async def recent(user: CurrentUser, db: DB, limit: int = Query(default=12, le=50)):
    stats = (await db.scalars(
        select(FoodStat).where(FoodStat.user_id == user.id).order_by(FoodStat.last_logged_at.desc()).limit(limit)
    )).all()
    out = []
    for s in stats:
        food = await db.get(Food, s.food_id)
        if food:
            out.append(await food_out(db, food))
    return out


@router.get("/frequent", response_model=list[FoodOut])
async def frequent(user: CurrentUser, db: DB, limit: int = Query(default=12, le=50)):
    stats = (await db.scalars(
        select(FoodStat).where(FoodStat.user_id == user.id).order_by(FoodStat.log_count.desc()).limit(limit)
    )).all()
    out = []
    for s in stats:
        food = await db.get(Food, s.food_id)
        if food:
            out.append(await food_out(db, food))
    return out


@router.get("/{food_id}", response_model=FoodOut)
async def get_food(food_id: str, user: CurrentUser, db: DB, version: int | None = None):
    food = await db.get(Food, food_id)
    if not food or (food.created_by and food.created_by != user.id):
        raise not_found("Food")
    return await food_out(db, food, version)


@router.post("", response_model=FoodOut, status_code=201)
async def create_food(body: FoodCreate, user: CurrentUser, db: DB):
    food = Food(
        id=uuid.uuid4().hex,
        current_version=1,
        name=body.name.strip(),
        brand=body.brand.strip() if body.brand else None,
        source="user",
        verification="unverified",
        is_liquid=body.is_liquid,
        popularity=10,
        created_by=user.id,
    )
    version = FoodVersion(
        food_id=food.id, version=1,
        nutrients=body.nutrients,
        serving_units=[u.model_dump(by_alias=True) for u in body.serving_units],
        default_serving=body.default_serving,
    )
    db.add_all([food, version])
    await db.commit()
    return await food_out(db, food)
