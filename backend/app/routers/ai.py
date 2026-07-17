"""AI: natural-language food logging via Groq — parse only, never writes.

Contract with the frontend:
- returns { items: [...], degraded: bool }; degraded=true means the AI path
  was unavailable (disabled, no key, timeout, provider error) and the client
  falls back to manual search. Parsed items resolve through the SAME food
  search as manual queries, and the user confirms before anything is logged.
"""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Request
from sqlalchemy import select

from ..config import get_settings
from ..deps import DB, CurrentUser
from ..models import Food, Pref
from ..observability import metrics
from ..rate_limit import rate_limit
from ..schemas import ParseFoodLogInput
from ..search import search_food_ids
from .foods import food_out

router = APIRouter(prefix="/ai", tags=["ai"])
log = logging.getLogger("replift.ai")

SYSTEM_PROMPT = """You extract food items from a meal description.
Return ONLY JSON: {"items":[{"rawText":str,"name":str,"quantity":number,"unit":str|null}]}
Rules: name = generic food name (e.g. "toast" -> "bread"); quantity defaults to 1;
unit is a household word like "cup","slice","g","scoop" or null; max 8 items;
never invent foods not mentioned; no nutrition estimates, no advice."""


async def _groq_parse(text: str) -> list[dict] | None:
    s = get_settings()
    if not s.ai_enabled or not s.groq_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=s.ai_timeout_seconds) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {s.groq_api_key}"},
                json={
                    "model": s.groq_model,
                    "temperature": 0,
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": text[:500]},
                    ],
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            items = json.loads(content).get("items", [])
            # validate structure defensively — the model's output is untrusted
            clean = []
            for item in items[:8]:
                name = str(item.get("name", "")).strip()[:80]
                if not name:
                    continue
                try:
                    quantity = float(item.get("quantity", 1))
                except (TypeError, ValueError):
                    quantity = 1
                if not (0 < quantity <= 5000):
                    quantity = 1
                unit = item.get("unit")
                clean.append({
                    "rawText": str(item.get("rawText", name))[:120],
                    "name": name,
                    "quantity": quantity,
                    "unit": str(unit)[:30] if unit else None,
                })
            return clean
    except Exception as exc:  # timeout, HTTP error, malformed JSON — all degrade
        log.warning("groq parse failed: %s", type(exc).__name__)
        metrics.inc("ai_degraded")
        return None


@router.post("/parse-food-log")
async def parse_food_log(body: ParseFoodLogInput, request: Request, user: CurrentUser, db: DB):
    await rate_limit(request, "ai", limit=30, window_seconds=3600)

    # per-user privacy switch
    pref = await db.get(Pref, (user.id, "privacy"))
    if pref and not pref.value.get("aiFeaturesEnabled", True):
        return {"items": [], "degraded": True}

    parsed = await _groq_parse(body.text)
    if parsed is None:
        return {"items": [], "degraded": True}

    metrics.inc("ai_parse")
    out = []
    for item in parsed:
        rows, _ = await search_food_ids(db, user.id, item["name"], page=1, page_size=1)
        match = None
        confidence = "low"
        if rows:
            row = rows[0]
            food = await db.get(Food, row["id"])
            if food:
                match = {
                    "food": (await food_out(db, food)).model_dump(by_alias=True),
                    "score": float(row["score"]),
                    "explain": {
                        "textScore": float(row["text_score"]),
                        "popularityBoost": float(row["popularity_boost"]),
                        "personalBoost": float(row["personal_boost"]),
                        "fuzzy": bool(row["fuzzy"]),
                    },
                }
                confidence = "high" if row["score"] >= 70 else "medium" if row["score"] >= 35 else "low"
        out.append({**item, "match": match, "confidence": confidence})

    return {"items": out, "degraded": False}
