"""RepLift API — FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import get_settings
from .db import engine
from .observability import RequestContextMiddleware, configure_logging, metrics_endpoint
from .rate_limit import get_redis
from .routers import account, ai, auth, diary, foods, profile_goals, recipes, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    app.state.arq = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    yield
    await app.state.arq.close()
    await engine.dispose()


app = FastAPI(
    title="RepLift API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_problem(request: Request, exc: RequestValidationError):
    """422s in RFC 7807 shape with field-level messages."""
    errors: dict[str, str] = {}
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"] if p not in ("body", "query", "path"))
        errors[loc or "body"] = err["msg"]
    return JSONResponse(
        status_code=422,
        content={
            "type": "https://replift.app/problems/validation",
            "title": "Validation failed",
            "status": 422,
            "detail": "One or more fields are invalid.",
            "errors": errors,
        },
    )


@app.get("/health")
async def health():
    """Liveness + dependency checks (db, redis)."""
    checks = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "down"
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "down"
    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(status_code=200 if healthy else 503, content={"status": "ok" if healthy else "degraded", **checks})


app.add_route("/metrics", metrics_endpoint, methods=["GET"])

API = "/api/v1"
app.include_router(auth.router, prefix=API)
app.include_router(profile_goals.router, prefix=API)
app.include_router(foods.router, prefix=API)
app.include_router(recipes.router, prefix=API)
app.include_router(diary.router, prefix=API)
app.include_router(sync.router, prefix=API)
app.include_router(ai.router, prefix=API)
app.include_router(account.router, prefix=API)
