"""Database bootstrap + seed.

Creates extensions/indexes, tables, the curated food catalog, and the demo
account (demo@replift.app / demo1234) with 5 weeks of history — all read from
app/data/seed.json, which is EXPORTED from the frontend's TS seed so both
stacks share one source of truth.

Usage:
  python -m app.seed                 # bootstrap + seed (idempotent)
  python -m app.seed --synthetic N   # add N synthetic branded foods for load tests
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, text

from .db import SessionLocal, engine
from .models import (
    Base, DiaryEntry, Food, FoodStat, FoodVersion, Goal, Pref, Profile,
    Recipe, SavedMeal, User,
)
from .security import hash_password

DATA = Path(__file__).parent / "data" / "seed.json"

BOOTSTRAP_SQL = [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    # functional indexes powering search (FTS + trigram)
    """CREATE INDEX IF NOT EXISTS ix_foods_fts ON foods USING GIN (
         (setweight(to_tsvector('simple', name), 'A') ||
          setweight(to_tsvector('simple', coalesce(brand, '')), 'B')))""",
    """CREATE INDEX IF NOT EXISTS ix_foods_trgm ON foods USING GIN (
         lower(name || ' ' || coalesce(brand, '')) gin_trgm_ops)""",
]


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


ENTRY_COLUMNS = {"id", "userId", "kind", "date", "revision", "deleted", "updatedAt", "loggedAt", "syncState"}


async def bootstrap() -> None:
    async with engine.begin() as conn:
        await conn.execute(text(BOOTSTRAP_SQL[0]))
        await conn.run_sync(Base.metadata.create_all)
        for stmt in BOOTSTRAP_SQL[1:]:
            await conn.execute(text(stmt))


async def seed(synthetic: int = 0) -> None:
    raw = json.loads(DATA.read_text(encoding="utf-8"))
    demo = raw["demo"]

    async with SessionLocal() as db:
        already = await db.scalar(select(User).where(User.email == demo["user"]["email"]))
        if already:
            print("Seed already applied — skipping (drop the DB volume to reseed).")
            return

        # foods + versions
        for f in raw["foods"]:
            db.add(Food(
                id=f["id"], current_version=f["version"], name=f["name"], brand=f.get("brand"),
                source=f["source"], verification=f["verification"], is_liquid=f["isLiquid"],
                popularity=f.get("popularity", 25), created_by=None, created_at=_dt(f["createdAt"]),
            ))
            db.add(FoodVersion(
                food_id=f["id"], version=f["version"], nutrients=f["nutrients"],
                serving_units=f["servingUnits"], default_serving=f["defaultServing"],
            ))

        # demo user
        u = demo["user"]
        db.add(User(
            id=u["id"], email=u["email"], display_name=u["displayName"],
            password_hash=hash_password(demo["password"]), email_verified=True, created_at=_dt(u["createdAt"]),
        ))
        await db.flush()  # users + foods must exist before FK'd rows insert
        p = demo["profile"]
        db.add(Profile(
            user_id=u["id"], sex=p["sex"], birth_date=p["birthDate"], height_cm=p["heightCm"],
            activity_level=p["activityLevel"], unit_system=p["unitSystem"], timezone=p["timezone"],
            onboarding_completed=True,
        ))
        for g in demo["goals"]:
            db.add(Goal(
                id=g["id"], user_id=u["id"], goal_type=g["goalType"], weekly_rate_kg=g["weeklyRateKg"],
                target_weight_kg=g.get("targetWeightKg"), calorie_target=g["calorieTarget"],
                protein_target_g=g["proteinTargetG"], carbs_target_g=g["carbsTargetG"],
                fat_target_g=g["fatTargetG"], water_target_ml=g["waterTargetMl"],
                effective_date=g["effectiveDate"], created_at=_dt(g["createdAt"]),
            ))

        # diary history + food stats
        stats: dict[str, dict] = {}
        for e in demo["history"]:
            payload = {k: v for k, v in e.items() if k not in ENTRY_COLUMNS and v is not None}
            payload["loggedAt"] = e["loggedAt"]
            db.add(DiaryEntry(
                id=e["id"], user_id=u["id"], kind=e["kind"], date=e["date"], revision=e["revision"],
                deleted=False, payload=payload, logged_at=_dt(e["loggedAt"]), updated_at=_dt(e["updatedAt"]),
            ))
            if e["kind"] == "food":
                s = stats.setdefault(e["foodId"], {"count": 0, "last": e["loggedAt"]})
                s["count"] += 1
                s["last"] = max(s["last"], e["loggedAt"])
        for food_id, s in stats.items():
            db.add(FoodStat(user_id=u["id"], food_id=food_id, log_count=s["count"], last_logged_at=_dt(s["last"])))

        for r in demo["recipes"]:
            db.add(Recipe(
                id=r["id"], user_id=u["id"], revision=r["revision"], name=r["name"],
                description=r.get("description"), servings=r["servings"], ingredients=r["ingredients"],
                per_serving=r["perServing"], created_at=_dt(r["createdAt"]), updated_at=_dt(r["updatedAt"]),
            ))
        for m in demo["savedMeals"]:
            db.add(SavedMeal(id=m["id"], user_id=u["id"], revision=m["revision"], name=m["name"],
                             items=m["items"], created_at=_dt(m["createdAt"])))

        db.add(Pref(user_id=u["id"], key="privacy", value={"analyticsOptOut": False, "aiFeaturesEnabled": True}))
        db.add(Pref(user_id=u["id"], key="notifications", value={
            "mealReminders": True, "waterReminders": False, "weeklyReportEmail": True, "weighInReminder": True,
        }))

        await db.commit()
        print(f"Seeded {len(raw['foods'])} foods, {len(demo['history'])} diary entries, demo account ready.")

    if synthetic > 0:
        await seed_synthetic(synthetic, raw["foods"])


async def seed_synthetic(n: int, base_foods: list[dict]) -> None:
    """Synthetic branded variants for load testing search (kept out of the
    default seed so demo search stays clean). Used by docs/performance.md."""
    brands = ["NutriMax", "FreshFit", "GreenLeaf", "PowerFuel", "DailyBite", "PureForm", "VitaCore", "SnackWell"]
    suffixes = ["Original", "Lite", "Extra", "Family Pack", "Mini", "Classic", "Zero", "Plus"]
    rng = random.Random(42)
    async with SessionLocal() as db:
        for i in range(n):
            base = rng.choice(base_foods)
            db.add(Food(
                id=f"syn-{i:06d}", current_version=1,
                name=f"{base['name'].split(',')[0]} {rng.choice(suffixes)}",
                brand=rng.choice(brands), source="branded", verification="community",
                is_liquid=base["isLiquid"], popularity=rng.uniform(1, 40),
            ))
            db.add(FoodVersion(
                food_id=f"syn-{i:06d}", version=1, nutrients=base["nutrients"],
                serving_units=base["servingUnits"], default_serving=base["defaultServing"],
            ))
            if i % 2000 == 1999:
                await db.commit()
        await db.commit()
    print(f"Added {n} synthetic foods for load testing.")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic", type=int, default=0)
    args = parser.parse_args()
    await bootstrap()
    await seed(args.synthetic)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
