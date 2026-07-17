"""Recipes + saved meals. Per-serving nutrition computed by the domain engine."""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..domain.nutrition import recipe_per_serving
from ..models import FoodVersion, Recipe, SavedMeal, utcnow
from ..problems import Problem, not_found
from ..schemas import RecipeCreate, RecipeOut, RecipePatch, SavedMealCreate, SavedMealOut

router = APIRouter(tags=["recipes"])


async def _per_serving(db, ingredients: list[dict], servings: float) -> dict:
    resolved = []
    for ing in ingredients:
        version = await db.get(FoodVersion, (ing["foodId"], ing["foodVersion"]))
        if not version:
            raise Problem(422, "Unknown ingredient", f"Food {ing['foodId']} v{ing['foodVersion']} not found.")
        resolved.append({"grams": ing["grams"], "per100": version.nutrients})
    return recipe_per_serving(resolved, servings)


@router.get("/recipes", response_model=list[RecipeOut])
async def list_recipes(user: CurrentUser, db: DB):
    return (await db.scalars(select(Recipe).where(Recipe.user_id == user.id).order_by(Recipe.created_at))).all()


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
async def get_recipe(recipe_id: str, user: CurrentUser, db: DB):
    recipe = await db.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != user.id:
        raise not_found("Recipe")
    return recipe


@router.post("/recipes", response_model=RecipeOut, status_code=201)
async def create_recipe(body: RecipeCreate, user: CurrentUser, db: DB):
    ingredients = [i.model_dump(by_alias=True) for i in body.ingredients]
    recipe = Recipe(
        id=uuid.uuid4().hex, user_id=user.id, revision=1,
        name=body.name.strip(), description=body.description,
        servings=body.servings, ingredients=ingredients,
        per_serving=await _per_serving(db, ingredients, body.servings),
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    return recipe


@router.patch("/recipes/{recipe_id}", response_model=RecipeOut)
async def update_recipe(recipe_id: str, revision: int, body: RecipePatch, user: CurrentUser, db: DB):
    recipe = await db.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != user.id:
        raise not_found("Recipe")
    if recipe.revision != revision:
        raise Problem(409, "Recipe was modified elsewhere", "Reload and reapply your changes.")
    patch = body.model_dump(exclude_unset=True, by_alias=False)
    if "ingredients" in patch and patch["ingredients"] is not None:
        recipe.ingredients = [dict(i) if isinstance(i, dict) else i for i in
                              [ing.model_dump(by_alias=True) for ing in body.ingredients]]
    for field in ("name", "description", "servings"):
        if field in patch and patch[field] is not None:
            setattr(recipe, field, patch[field])
    recipe.per_serving = await _per_serving(db, recipe.ingredients, recipe.servings)
    recipe.revision += 1
    recipe.updated_at = utcnow()
    await db.commit()
    await db.refresh(recipe)
    return recipe


@router.delete("/recipes/{recipe_id}", status_code=204)
async def delete_recipe(recipe_id: str, user: CurrentUser, db: DB):
    recipe = await db.get(Recipe, recipe_id)
    if recipe and recipe.user_id == user.id:
        await db.delete(recipe)
        await db.commit()


@router.get("/saved-meals", response_model=list[SavedMealOut])
async def list_saved(user: CurrentUser, db: DB):
    return (await db.scalars(select(SavedMeal).where(SavedMeal.user_id == user.id))).all()


@router.post("/saved-meals", response_model=SavedMealOut, status_code=201)
async def create_saved(body: SavedMealCreate, user: CurrentUser, db: DB):
    meal = SavedMeal(id=uuid.uuid4().hex, user_id=user.id, revision=1, name=body.name.strip(), items=body.items)
    db.add(meal)
    await db.commit()
    await db.refresh(meal)
    return meal


@router.delete("/saved-meals/{meal_id}", status_code=204)
async def delete_saved(meal_id: str, user: CurrentUser, db: DB):
    meal = await db.get(SavedMeal, meal_id)
    if meal and meal.user_id == user.id:
        await db.delete(meal)
        await db.commit()
