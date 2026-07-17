"""Pydantic schemas — camelCase wire format matching frontend/src/lib/api/types.ts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- auth ----------

class RegisterInput(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=2, max_length=120)


class LoginInput(CamelModel):
    email: EmailStr
    password: str


class UserOut(CamelModel):
    id: str
    email: str
    display_name: str
    created_at: Any
    email_verified: bool


class AuthTokensOut(CamelModel):
    access_token: str
    expires_at: Any


class AuthResponse(CamelModel):
    user: UserOut
    tokens: AuthTokensOut


class SessionOut(CamelModel):
    id: str
    device: str
    ip: str
    last_active_at: Any
    created_at: Any
    current: bool


class PasswordResetInput(CamelModel):
    email: EmailStr


# ---------- profile & goals ----------

class ProfileOut(CamelModel):
    user_id: str
    sex: Literal["male", "female"]
    birth_date: str
    height_cm: float
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"]
    unit_system: Literal["metric", "imperial"]
    timezone: str
    onboarding_completed: bool


class ProfilePatch(CamelModel):
    sex: Literal["male", "female"] | None = None
    birth_date: str | None = None
    height_cm: float | None = Field(default=None, ge=50, le=280)
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"] | None = None
    unit_system: Literal["metric", "imperial"] | None = None
    timezone: str | None = None
    onboarding_completed: bool | None = None


class GoalIn(CamelModel):
    goal_type: Literal["lose", "maintain", "gain"]
    weekly_rate_kg: float = Field(ge=-2, le=2)
    target_weight_kg: float | None = Field(default=None, ge=20, le=400)
    calorie_target: int = Field(ge=800, le=10000)
    protein_target_g: int = Field(ge=0, le=1000)
    carbs_target_g: int = Field(ge=0, le=2000)
    fat_target_g: int = Field(ge=0, le=1000)
    water_target_ml: int = Field(ge=0, le=20000)
    effective_date: str


class GoalOut(GoalIn):
    id: str
    user_id: str
    created_at: Any


# ---------- foods ----------

class ServingUnitIn(CamelModel):
    id: str
    label: str = Field(min_length=1, max_length=80)
    grams: float = Field(gt=0, le=10000)


class FoodCreate(CamelModel):
    name: str = Field(min_length=2, max_length=255)
    brand: str | None = Field(default=None, max_length=255)
    is_liquid: bool = False
    nutrients: dict[str, float]
    serving_units: list[ServingUnitIn] = []
    default_serving: dict[str, Any]


class FoodOut(CamelModel):
    id: str
    version: int
    name: str
    brand: str | None = None
    source: str
    verification: str
    nutrients: dict[str, float]
    is_liquid: bool
    serving_units: list[dict[str, Any]]
    default_serving: dict[str, Any]
    created_by: str | None = None
    created_at: Any


class SearchExplain(CamelModel):
    text_score: float
    popularity_boost: float
    personal_boost: float
    fuzzy: bool


class FoodSearchResultOut(CamelModel):
    food: FoodOut
    score: float
    explain: SearchExplain


class PageOut(CamelModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    has_more: bool


# ---------- recipes & saved meals ----------

class RecipeIngredientIn(CamelModel):
    id: str
    food_id: str
    food_version: int
    food_name: str
    quantity: float
    unit_id: str
    grams: float = Field(gt=0, le=100000)


class RecipeCreate(CamelModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = None
    servings: float = Field(ge=1, le=100)
    ingredients: list[RecipeIngredientIn] = Field(min_length=1)


class RecipePatch(CamelModel):
    name: str | None = None
    description: str | None = None
    servings: float | None = Field(default=None, ge=1, le=100)
    ingredients: list[RecipeIngredientIn] | None = None


class RecipeOut(CamelModel):
    id: str
    user_id: str
    revision: int
    name: str
    description: str | None = None
    servings: float
    ingredients: list[dict[str, Any]]
    per_serving: dict[str, float]
    created_at: Any
    updated_at: Any


class SavedMealCreate(CamelModel):
    name: str = Field(min_length=2, max_length=255)
    items: list[dict[str, Any]] = Field(min_length=1)


class SavedMealOut(CamelModel):
    id: str
    user_id: str
    revision: int
    name: str
    items: list[dict[str, Any]]
    created_at: Any


# ---------- sync ----------

class MutationIn(CamelModel):
    op: Literal["create", "update", "delete"]
    entity: Literal["diary_entry"]
    id: str | None = None
    base_revision: int | None = None
    data: dict[str, Any] | None = None


class QueuedMutationIn(CamelModel):
    idempotency_key: str = Field(min_length=8, max_length=64)
    mutation: MutationIn
    queued_at: str
    attempts: int = 0
    last_error: str | None = None


class SyncPushIn(CamelModel):
    mutations: list[QueuedMutationIn] = Field(max_length=200)


class SyncPushResultOut(CamelModel):
    idempotency_key: str
    status: Literal["applied", "duplicate", "conflict", "rejected"]
    server_entry: dict[str, Any] | None = None
    new_revision: int | None = None
    error: str | None = None


class SyncPushResponseOut(CamelModel):
    results: list[SyncPushResultOut]
    server_time: str


# ---------- account ----------

class NotificationPrefsIO(CamelModel):
    meal_reminders: bool = True
    water_reminders: bool = False
    weekly_report_email: bool = True
    weigh_in_reminder: bool = True


class PrivacyIO(CamelModel):
    analytics_opt_out: bool = False
    ai_features_enabled: bool = True


class DeleteAccountInput(CamelModel):
    password: str


class ExportJobOut(CamelModel):
    id: str
    status: str
    requested_at: Any
    completed_at: Any | None = None
    download_url: str | None = None
    progress_pct: int


# ---------- ai ----------

class ParseFoodLogInput(CamelModel):
    text: str = Field(min_length=3, max_length=500)
