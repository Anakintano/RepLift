"""Redis sliding-window rate limiting for abuse-prone endpoints."""

from __future__ import annotations

import time

from fastapi import Request
from redis.asyncio import Redis

from .config import get_settings
from .problems import Problem

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def rate_limit(request: Request, bucket: str, limit: int, window_seconds: int) -> None:
    """Sliding window via sorted set. Fails OPEN if Redis is down —
    availability of core logging beats strict limiting for this product."""
    if get_settings().env == "test":
        return
    ip = request.client.host if request.client else "unknown"
    key = f"rl:{bucket}:{ip}"
    now = time.time()
    try:
        r = get_redis()
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, now - window_seconds)
        pipe.zadd(key, {f"{now}": now})
        pipe.zcard(key)
        pipe.expire(key, window_seconds)
        _, _, count, _ = await pipe.execute()
    except Exception:
        return
    if count > limit:
        raise Problem(429, "Too many requests", f"Rate limit exceeded — try again in a few minutes.")
