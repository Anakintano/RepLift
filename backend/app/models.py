"""SQLAlchemy 2.0 models.

Design notes (see docs/adr/):
- diary_entries stores kind-specific fields in a JSONB `payload`; identity,
  ordering, and concurrency fields (user_id, date, kind, revision, deleted,
  updated_at) are real columns with indexes. The entry union is client-defined
  and versioned by the sync protocol, not by table shape.
- foods split identity/search (foods) from immutable nutrition payloads
  (food_versions); diary entries reference (food_id, version) so corrections
  never rewrite history.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSONB, list[Any]: JSONB}


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(255))
    device: Mapped[str] = mapped_column(String(255), default="Unknown device")
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    sex: Mapped[str] = mapped_column(String(10), default="male")
    birth_date: Mapped[str] = mapped_column(String(10), default="2000-01-01")
    height_cm: Mapped[float] = mapped_column(Float, default=170)
    activity_level: Mapped[str] = mapped_column(String(20), default="moderate")
    unit_system: Mapped[str] = mapped_column(String(10), default="metric")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal_type: Mapped[str] = mapped_column(String(10))
    weekly_rate_kg: Mapped[float] = mapped_column(Float, default=0)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    calorie_target: Mapped[int] = mapped_column(Integer)
    protein_target_g: Mapped[int] = mapped_column(Integer)
    carbs_target_g: Mapped[int] = mapped_column(Integer)
    fat_target_g: Mapped[int] = mapped_column(Integer)
    water_target_ml: Mapped[int] = mapped_column(Integer)
    effective_date: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (Index("ix_goals_user_effective", "user_id", "effective_date"),)


class Food(Base):
    """Food identity + search fields. Nutrition lives in immutable FoodVersion rows."""

    __tablename__ = "foods"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(255), index=True)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="user")
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    is_liquid: Mapped[bool] = mapped_column(Boolean, default=False)
    popularity: Mapped[float] = mapped_column(Float, default=25)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FoodVersion(Base):
    """Immutable nutrition payload for (food_id, version)."""

    __tablename__ = "food_versions"

    food_id: Mapped[str] = mapped_column(ForeignKey("foods.id", ondelete="CASCADE"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    nutrients: Mapped[dict[str, Any]] = mapped_column(JSONB)
    serving_units: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    default_serving: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[float] = mapped_column(Float)
    ingredients: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    per_serving: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SavedMeal(Base):
    __tablename__ = "saved_meals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(255))
    items: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DiaryEntry(Base):
    __tablename__ = "diary_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # client-generated UUID
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    date: Mapped[str] = mapped_column(String(10))  # user-tz diary day, YYYY-MM-DD
    revision: Mapped[int] = mapped_column(Integer, default=1)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)  # kind-specific camelCase fields
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_diary_user_date", "user_id", "date"),
        Index("ix_diary_user_kind_date", "user_id", "kind", "date"),
    )


class IdempotencyKey(Base):
    """One row per applied sync mutation; unique key makes replays no-ops."""

    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FoodStat(Base):
    """Per-user log counts: 'frequent foods' + personal search boost."""

    __tablename__ = "food_stats"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    food_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    log_count: Mapped[int] = mapped_column(Integer, default=0)
    last_logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Pref(Base):
    __tablename__ = "prefs"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class JobRun(Base):
    """Observable job execution history (incl. failures = dead-letter record)."""

    __tablename__ = "job_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    args: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|done|retrying|failed
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    event: Mapped[str] = mapped_column(String(120))
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


__all__ = [
    "Base",
    "User",
    "Session",
    "Profile",
    "Goal",
    "Food",
    "FoodVersion",
    "Recipe",
    "SavedMeal",
    "DiaryEntry",
    "IdempotencyKey",
    "FoodStat",
    "Pref",
    "ExportJob",
    "JobRun",
    "AuditEvent",
    "utcnow",
]
