"""Environment-based configuration (12-factor). All secrets come from env/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+asyncpg://replift:replift_dev@localhost:5432/replift"
    redis_url: str = "redis://localhost:6379"

    jwt_secret: str = "dev-only-secret"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    ai_enabled: bool = True
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    ai_timeout_seconds: float = 6.0

    cors_origins: str = "http://localhost:3000"

    exports_dir: str = "exports"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
