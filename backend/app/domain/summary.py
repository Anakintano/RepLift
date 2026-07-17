"""Day/week aggregation — mirrors frontend/src/lib/domain/summary.ts."""

from __future__ import annotations

from datetime import date as date_type, timedelta
from typing import Any

from .nutrition import remaining_kcal, round_half_up, sum_nutrients


def add_days(day: str, days: int) -> str:
    return (date_type.fromisoformat(day) + timedelta(days=days)).isoformat()


def week_bounds(day: str) -> tuple[str, str]:
    d = date_type.fromisoformat(day)
    start = d - timedelta(days=d.weekday())  # Monday
    return start.isoformat(), (start + timedelta(days=6)).isoformat()


def date_range(start: str, end: str) -> list[str]:
    out, d = [], date_type.fromisoformat(start)
    e = date_type.fromisoformat(end)
    while d <= e:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def compute_day_summary(day: str, entries: list[dict[str, Any]], goal: dict[str, Any]) -> dict[str, Any]:
    """entries: client-shaped dicts (payload merged); goal: camelCase dict."""
    live = [e for e in entries if e["date"] == day and not e.get("deleted")]
    foods = [e for e in live if e["kind"] == "food"]
    consumed = sum_nutrients([f["nutrients"] for f in foods])
    burned = sum(e["caloriesBurned"] for e in live if e["kind"] == "exercise")
    water = sum(e["amountMl"] for e in live if e["kind"] == "water")

    return {
        "date": day,
        "consumed": consumed,
        "burnedExercise": burned,
        "waterMl": water,
        "goal": {
            "calorieTarget": goal["calorieTarget"],
            "proteinTargetG": goal["proteinTargetG"],
            "carbsTargetG": goal["carbsTargetG"],
            "fatTargetG": goal["fatTargetG"],
            "waterTargetMl": goal["waterTargetMl"],
        },
        "remainingKcal": remaining_kcal(goal["calorieTarget"], consumed["kcal"], burned),
        "entryCount": len(live),
    }


def compute_weekly_report(week_start: str, entries: list[dict[str, Any]], goal: dict[str, Any]) -> dict[str, Any]:
    week_end = add_days(week_start, 6)
    days = date_range(week_start, week_end)
    live = [e for e in entries if not e.get("deleted") and week_start <= e["date"] <= week_end]

    def foods_on(d: str) -> list[dict[str, Any]]:
        return [e for e in live if e["kind"] == "food" and e["date"] == d]

    per_day = [
        {"date": d, "kcal": round_half_up(sum(f["nutrients"]["kcal"] for f in foods_on(d))), "target": goal["calorieTarget"]}
        for d in days
    ]

    logged = [p for p in per_day if any(e["date"] == p["date"] for e in live)]
    n = len(logged)

    def avg(fn) -> float:
        return 0 if n == 0 else round_half_up(sum(fn(p["date"]) for p in logged) / n, 1)

    weights = sorted((e for e in live if e["kind"] == "weight"), key=lambda e: e["date"])
    weight_change = round_half_up(weights[-1]["weightKg"] - weights[0]["weightKg"], 1) if len(weights) >= 2 else None

    exercises = [e for e in live if e["kind"] == "exercise"]

    target = goal["calorieTarget"]
    within = [
        p for p in logged
        if p["kcal"] > 0 and abs(p["kcal"] - target) / target <= 0.1
    ]
    best_day = min(within, key=lambda p: abs(p["kcal"] - target))["date"] if within else None

    return {
        "weekStart": week_start,
        "weekEnd": week_end,
        "avgKcal": avg(lambda d: sum(f["nutrients"]["kcal"] for f in foods_on(d))),
        "avgProteinG": avg(lambda d: sum(f["nutrients"].get("proteinG", 0) for f in foods_on(d))),
        "avgCarbsG": avg(lambda d: sum(f["nutrients"].get("carbsG", 0) for f in foods_on(d))),
        "avgFatG": avg(lambda d: sum(f["nutrients"].get("fatG", 0) for f in foods_on(d))),
        "avgWaterMl": avg(lambda d: sum(e["amountMl"] for e in live if e["kind"] == "water" and e["date"] == d)),
        "daysLogged": n,
        "weightChangeKg": weight_change,
        "exerciseSessions": len(exercises),
        "exerciseMinutes": sum(e["durationMin"] for e in exercises),
        "caloriesBurned": round_half_up(sum(e["caloriesBurned"] for e in exercises)),
        "adherencePct": 0 if n == 0 else round_half_up(len(within) / n * 100),
        "bestDay": best_day,
        "perDay": per_day,
    }
