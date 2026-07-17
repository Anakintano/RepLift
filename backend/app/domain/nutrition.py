"""Nutrition engine — Python mirror of frontend/src/lib/domain/nutrition.ts.

Both implementations run the same test vectors (tests/test_nutrition.py mirrors
nutrition.test.ts). Rounding policy: half-up; kcal & mg fields to integers,
gram fields to 1 decimal; applied only at persistence/presentation boundaries.
"""

from __future__ import annotations

import math
from typing import Any

Nutrients = dict[str, float]

INT_FIELDS = {"kcal", "sodiumMg", "potassiumMg", "calciumMg", "cholesterolMg"}


def round_half_up(value: float, dp: int = 0) -> float:
    f = 10**dp
    nudge = math.copysign(2.220446049250313e-16, value)  # EPSILON, mirrors JS
    out = math.floor(abs((value + nudge) * f) + 0.5) * math.copysign(1, value) / f
    return int(out) if dp == 0 else out


def round_nutrients(n: Nutrients) -> Nutrients:
    return {
        k: round_half_up(v, 0 if k in INT_FIELDS else 1)
        for k, v in n.items()
        if v is not None
    }


def resolve_grams(serving_units: list[dict[str, Any]], quantity: float, unit_id: str) -> float:
    if not math.isfinite(quantity) or quantity < 0:
        raise ValueError(f"Invalid quantity: {quantity}")
    if unit_id == "g":
        return quantity
    for u in serving_units:
        if u["id"] == unit_id:
            return quantity * u["grams"]
    raise ValueError(f"Unknown serving unit '{unit_id}'")


def scale_nutrients(per100: Nutrients, grams: float) -> Nutrients:
    factor = grams / 100
    return {k: v * factor for k, v in per100.items() if v is not None}


def nutrients_for_serving(
    per100: Nutrients, serving_units: list[dict[str, Any]], quantity: float, unit_id: str
) -> tuple[float, Nutrients]:
    grams = resolve_grams(serving_units, quantity, unit_id)
    return grams, round_nutrients(scale_nutrients(per100, grams))


EMPTY: Nutrients = {"kcal": 0, "proteinG": 0, "carbsG": 0, "fatG": 0}


def sum_nutrients(items: list[Nutrients]) -> Nutrients:
    out: Nutrients = dict(EMPTY)
    for n in items:
        for k, v in n.items():
            if v is None:
                continue
            out[k] = out.get(k, 0) + v
    return out


def recipe_per_serving(ingredients: list[dict[str, Any]], servings: float) -> Nutrients:
    """ingredients: [{grams, per100}]"""
    if not math.isfinite(servings) or servings <= 0:
        raise ValueError(f"Recipe servings must be > 0, got {servings}")
    total = sum_nutrients([scale_nutrients(i["per100"], i["grams"]) for i in ingredients])
    return round_nutrients({k: v / servings for k, v in total.items()})


def remaining_kcal(calorie_target: float, consumed_kcal: float, exercise_burned: float, credit_exercise: bool = True) -> float:
    credit = exercise_burned if credit_exercise else 0
    return round_half_up(calorie_target - consumed_kcal + credit)
