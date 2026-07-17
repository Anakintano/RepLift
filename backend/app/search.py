"""Food search — Postgres FTS + pg_trgm with explainable ranking.

score = textScore + popularityBoost + personalBoost
  textScore        = 100 · GREATEST(min(ts_rank·4, 1), trigram_similarity)
  popularityBoost  = textScore · 0.3 · log10(1 + popularity)
  personalBoost    = LEAST(25, user_log_count · 5)
fuzzy = matched only via trigram (typo path).

Synonym expansion happens before the query (same table the mock used).
Every result returns its breakdown — ranking stays explainable/measurable.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_SYNONYMS: dict[str, list[str]] | None = None


def synonyms() -> dict[str, list[str]]:
    global _SYNONYMS
    if _SYNONYMS is None:
        seed = json.loads((Path(__file__).parent / "data" / "seed.json").read_text(encoding="utf-8"))
        _SYNONYMS = seed["synonyms"]
    return _SYNONYMS


def expand_query(q: str) -> list[str]:
    base = q.lower().strip()
    out = [base]
    for syn, targets in synonyms().items():
        if syn in base:
            out.extend(base.replace(syn, t) for t in targets)
    return out[:4]


SEARCH_SQL = text("""
WITH params AS (
  SELECT :q AS raw,
         (SELECT string_agg(lexeme || ':*', ' & ')
            FROM unnest(regexp_split_to_array(trim(:q), '\\s+')) AS lexeme
           WHERE lexeme <> '') AS prefix_query
),
scored AS (
  SELECT f.id,
         GREATEST(
           LEAST(ts_rank(
             setweight(to_tsvector('simple', f.name), 'A') ||
             setweight(to_tsvector('simple', coalesce(f.brand, '')), 'B'),
             to_tsquery('simple', p.prefix_query)) * 4.0, 1.0),
           similarity(lower(f.name || ' ' || coalesce(f.brand, '')), lower(p.raw))
         ) * 100 AS text_score,
         (to_tsvector('simple', f.name || ' ' || coalesce(f.brand, '')) @@ to_tsquery('simple', p.prefix_query)) AS ts_hit,
         similarity(lower(f.name || ' ' || coalesce(f.brand, '')), lower(p.raw)) AS sim,
         f.popularity
    FROM foods f, params p
   WHERE p.prefix_query IS NOT NULL
     AND (
       to_tsvector('simple', f.name || ' ' || coalesce(f.brand, '')) @@ to_tsquery('simple', p.prefix_query)
       OR similarity(lower(f.name || ' ' || coalesce(f.brand, '')), lower(p.raw)) > 0.18
     )
     AND (f.created_by IS NULL OR f.created_by = :user_id)
)
SELECT s.id,
       round(s.text_score::numeric, 1) AS text_score,
       round((s.text_score * 0.3 * log(1 + s.popularity))::numeric, 1) AS popularity_boost,
       LEAST(25, coalesce(fs.log_count, 0) * 5) AS personal_boost,
       (NOT s.ts_hit AND s.sim > 0.18) AS fuzzy,
       round((s.text_score
              + s.text_score * 0.3 * log(1 + s.popularity)
              + LEAST(25, coalesce(fs.log_count, 0) * 5))::numeric, 1) AS score
  FROM scored s
  LEFT JOIN food_stats fs ON fs.food_id = s.id AND fs.user_id = :user_id
 WHERE s.text_score > 5
 ORDER BY score DESC, s.id
 LIMIT :limit OFFSET :offset
""")

COUNT_SQL = text("""
WITH params AS (
  SELECT :q AS raw,
         (SELECT string_agg(lexeme || ':*', ' & ')
            FROM unnest(regexp_split_to_array(trim(:q), '\\s+')) AS lexeme
           WHERE lexeme <> '') AS prefix_query
)
SELECT count(*) FROM foods f, params p
 WHERE p.prefix_query IS NOT NULL
   AND (
     to_tsvector('simple', f.name || ' ' || coalesce(f.brand, '')) @@ to_tsquery('simple', p.prefix_query)
     OR similarity(lower(f.name || ' ' || coalesce(f.brand, '')), lower(p.raw)) > 0.18
   )
   AND (f.created_by IS NULL OR f.created_by = :user_id)
""")


async def search_food_ids(
    db: AsyncSession, user_id: str, query: str, page: int, page_size: int
) -> tuple[list[dict[str, Any]], int]:
    """Returns ([{id, score, explain…}] best-variant-per-food, total)."""
    best: dict[str, dict[str, Any]] = {}
    total = 0
    for variant in expand_query(query):
        rows = (await db.execute(
            SEARCH_SQL, {"q": variant, "user_id": user_id, "limit": page_size * 2, "offset": 0}
        )).mappings().all()
        variant_total = await db.scalar(COUNT_SQL, {"q": variant, "user_id": user_id}) or 0
        total = max(total, variant_total)
        for row in rows:
            cur = best.get(row["id"])
            if not cur or row["score"] > cur["score"]:
                best[row["id"]] = dict(row)

    ranked = sorted(best.values(), key=lambda r: (-r["score"], r["id"]))
    start = (page - 1) * page_size
    return ranked[start : start + page_size], max(total, len(ranked))
