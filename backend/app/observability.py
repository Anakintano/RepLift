"""Structured JSON logging with request correlation + minimal Prometheus metrics.

Redaction: request bodies are never logged; only method, path template, status,
duration, and request id — no health data, no credentials.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("request_id", "method", "path", "status", "duration_ms", "user_id", "job"):
            if hasattr(record, key):
                entry[key] = getattr(record, key)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").disabled = True  # replaced by our middleware


log = logging.getLogger("replift")


class Metrics:
    """In-process counters/histograms, exposed in Prometheus text format."""

    def __init__(self) -> None:
        self.requests = defaultdict(int)  # (method, route, status) -> count
        self.latency_sum = defaultdict(float)  # (route) -> seconds
        self.latency_count = defaultdict(int)
        self.counters = defaultdict(int)  # free-form domain counters

    def observe(self, method: str, route: str, status: int, seconds: float) -> None:
        self.requests[(method, route, status)] += 1
        self.latency_sum[route] += seconds
        self.latency_count[route] += 1

    def inc(self, name: str, by: int = 1) -> None:
        self.counters[name] += by

    def render(self) -> str:
        lines = [
            "# HELP replift_requests_total HTTP requests",
            "# TYPE replift_requests_total counter",
        ]
        for (method, route, status), count in sorted(self.requests.items()):
            lines.append(f'replift_requests_total{{method="{method}",route="{route}",status="{status}"}} {count}')
        lines += [
            "# HELP replift_request_duration_seconds Cumulative request latency",
            "# TYPE replift_request_duration_seconds summary",
        ]
        for route, total in sorted(self.latency_sum.items()):
            lines.append(f'replift_request_duration_seconds_sum{{route="{route}"}} {total:.4f}')
            lines.append(f'replift_request_duration_seconds_count{{route="{route}"}} {self.latency_count[route]}')
        lines += ["# HELP replift_events_total Domain events", "# TYPE replift_events_total counter"]
        for name, count in sorted(self.counters.items()):
            lines.append(f'replift_events_total{{event="{name}"}} {count}')
        return "\n".join(lines) + "\n"


metrics = Metrics()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration = time.perf_counter() - start
            log.exception(
                "request failed",
                extra={"request_id": request_id, "method": request.method, "path": request.url.path,
                       "status": 500, "duration_ms": round(duration * 1000, 1)},
            )
            raise
        duration = time.perf_counter() - start
        route = request.scope.get("route")
        route_path = getattr(route, "path", request.url.path)
        metrics.observe(request.method, route_path, response.status_code, duration)
        log.info(
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": route_path,
                "status": response.status_code,
                "duration_ms": round(duration * 1000, 1),
                "user_id": getattr(request.state, "user_id", None),
            },
        )
        response.headers["x-request-id"] = request_id
        return response


async def metrics_endpoint(_: Request) -> PlainTextResponse:
    return PlainTextResponse(metrics.render(), media_type="text/plain; version=0.0.4")
