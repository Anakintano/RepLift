"""RFC 7807 problem responses — the one error shape the API produces."""

from __future__ import annotations

import re

from fastapi import HTTPException


def _slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


class Problem(HTTPException):
    def __init__(self, status: int, title: str, detail: str | None = None, errors: dict[str, str] | None = None):
        body = {
            "type": f"https://replift.app/problems/{_slug(title)}",
            "title": title,
            "status": status,
        }
        if detail:
            body["detail"] = detail
        if errors:
            body["errors"] = errors
        super().__init__(status_code=status, detail=body)


def unauthorized(detail: str = "Please log in again.") -> Problem:
    return Problem(401, "Not authenticated", detail)


def forbidden(detail: str = "You don't have access to this resource.") -> Problem:
    return Problem(403, "Forbidden", detail)


def not_found(what: str = "Resource") -> Problem:
    return Problem(404, f"{what} not found")
