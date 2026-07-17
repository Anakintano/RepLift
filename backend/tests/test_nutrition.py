"""Nutrition engine vectors — MUST match frontend nutrition.test.ts exactly."""

import pytest

from app.domain.nutrition import (
    nutrients_for_serving,
    recipe_per_serving,
    remaining_kcal,
    resolve_grams,
    round_half_up,
    scale_nutrients,
    sum_nutrients,
)

EGG_PER100 = {"kcal": 155, "proteinG": 12.6, "carbsG": 1.1, "fatG": 10.6, "cholesterolMg": 373}
EGG_UNITS = [{"id": "u-large", "label": "1 large egg", "grams": 50}, {"id": "u-medium", "label": "1 medium egg", "grams": 44}]


def test_round_half_up_matches_ts():
    assert round_half_up(2.5) == 3
    assert round_half_up(2.4) == 2
    assert round_half_up(2.675, 2) == 2.68  # binary-float edge case
    assert round_half_up(1.005, 2) == 1.01


def test_resolve_grams():
    assert resolve_grams(EGG_UNITS, 2, "u-large") == 100
    assert resolve_grams(EGG_UNITS, 0.5, "u-medium") == 22
    assert resolve_grams(EGG_UNITS, 137, "g") == 137
    with pytest.raises(ValueError):
        resolve_grams(EGG_UNITS, 1, "u-nope")
    with pytest.raises(ValueError):
        resolve_grams(EGG_UNITS, -1, "g")


def test_shared_vector_two_large_eggs():
    grams, n = nutrients_for_serving(EGG_PER100, EGG_UNITS, 2, "u-large")
    assert grams == 100
    assert n["kcal"] == 155
    assert n["proteinG"] == 12.6
    assert n["cholesterolMg"] == 373


def test_shared_vector_decimal_quantity():
    grams, n = nutrients_for_serving(EGG_PER100, EGG_UNITS, 1.5, "u-medium")
    assert grams == 66
    assert n["kcal"] == 102  # 155 * 0.66 = 102.3 → 102
    assert n["proteinG"] == 8.3  # 12.6 * 0.66 = 8.316 → 8.3


def test_missing_micros_stay_missing():
    scaled = scale_nutrients({"kcal": 100, "proteinG": 10, "carbsG": 5, "fatG": 2}, 200)
    assert "fiberG" not in scaled


def test_shared_vector_recipe_meal_prep():
    per = recipe_per_serving(
        [
            {"grams": 600, "per100": {"kcal": 165, "proteinG": 31, "carbsG": 0, "fatG": 3.6}},
            {"grams": 720, "per100": {"kcal": 121, "proteinG": 3.5, "carbsG": 25.2, "fatG": 0.4}},
            {"grams": 27, "per100": {"kcal": 884, "proteinG": 0, "carbsG": 0, "fatG": 100}},
            {"grams": 110, "per100": {"kcal": 40, "proteinG": 1.1, "carbsG": 9.3, "fatG": 0.1}},
        ],
        4,
    )
    assert per["kcal"] == 536
    assert per["proteinG"] == 53.1
    with pytest.raises(ValueError):
        recipe_per_serving([], 0)


def test_sum_and_budget():
    total = sum_nutrients([
        {"kcal": 100, "proteinG": 10, "carbsG": 5, "fatG": 2, "fiberG": 3},
        {"kcal": 50, "proteinG": 5, "carbsG": 2, "fatG": 1},
    ])
    assert total["kcal"] == 150 and total["fiberG"] == 3
    assert remaining_kcal(2200, 1800, 300, True) == 700
    assert remaining_kcal(2200, 1800, 300, False) == 400
    assert remaining_kcal(2000, 2500, 0) == -500
