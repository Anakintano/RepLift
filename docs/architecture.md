# RepLift Architecture

```
┌────────────────────── Browser ──────────────────────┐
│  Next.js UI (App Router, client components)         │
│    │ reads: Dexie live queries (offline-first)      │
│    ▼                                                │
│  IndexedDB: entries · outbox · conflicts            │
│    │ writes: queued mutations + idempotency keys    │
└────┼────────────────────────────────────────────────┘
     ▼  POST /api/v1/sync/push   (same-origin proxy)
┌──────────────────── FastAPI (/api/v1) ──────────────┐
│ auth (argon2, JWT + rotating refresh cookies)       │
│ sync (idempotency_keys table, per-entry revisions)  │
│ foods search (Postgres FTS + pg_trgm, explainable)  │
│ diary/reports (shared domain engine, Python mirror) │
│ ai (Groq parse → same search → user confirms)       │
└────┬──────────────────────────┬─────────────────────┘
     ▼                          ▼
 PostgreSQL 16             Redis 7 ── ARQ worker
 (source of truth,         (rate limits, job queue:
  JSONB payloads,           exports, purge, weekly
  immutable food versions)  reports, popularity refresh)
```

**Two ApiClient implementations, one contract** (`frontend/src/lib/api/client.ts`):
the in-browser mock (Phase 1, powers the live GitHub Pages demo) and the HTTP
client (full stack). Screens cannot tell them apart; the sync outbox is
identical in both modes.

## Decision records (condensed ADRs)

| # | Decision | Why | Alternatives / revisit when |
|---|---|---|---|
| 1 | **Modular monolith** (one FastAPI app + one worker) | Single deployable, transactions across modules, zero distributed-systems overhead for this scale | Split services if search or sync traffic diverges by >10x |
| 2 | **Postgres for everything** incl. search (FTS + pg_trgm) | One system of record; explainable ranking in SQL; no index-sync failure mode | Elasticsearch/Meilisearch if catalog ≫ 1M rows or per-language analyzers needed |
| 3 | **Client-generated UUIDs + idempotency keys** for all diary writes | Retries/replays are no-ops by construction; offline creation needs client ids anyway | — (foundational) |
| 4 | **Revision-per-entry optimistic concurrency**; conflicts surfaced to user | Health records must never merge silently; per-field CRDTs are overkill for single-user entries | CRDT/merge if collaborative editing ever appears |
| 5 | **JSONB payload for diary entries** (columns only for identity/index/concurrency fields) | The entry union is client-versioned; sync stays generic; day queries only need indexed columns | Promote hot fields to columns if analytics need SQL over nutrients |
| 6 | **Immutable food versions** (`foods` + `food_versions`) | Corrections never rewrite history; entries pin (food_id, version) | — |
| 7 | **ARQ over Celery** | Async-native (one event-loop model with FastAPI), tiny, supports retries/cron; job history is our own `job_runs` table | Celery if fan-out scale or complex routing appears |
| 8 | **Cookie JWT (httpOnly) + rotating refresh, same-origin proxy** | No tokens in JS, no CORS surface in production topology; rotation limits stolen-refresh blast radius | — |
| 9 | **AI = parse-only boundary** (Groq → structured items → same search → user confirms) | Product works with AI off; LLM output treated as untrusted input, validated & resolved deterministically | — |
| 10 | **Domain engine mirrored TS/Python with shared test vectors** | Offline client must compute what the server computes; vectors keep drift impossible to miss | Extract to WASM if a third platform appears |

## Data lifecycle & privacy

- **Deletion**: two-phase — credentials + sessions invalidated synchronously; a
  background job purges diary/recipes/stats/exports; audit event retained.
- **Export**: background job writes JSON; authenticated download link.
- **Logs**: request id, route template, status, duration only — never bodies,
  never health data. AI receives only the meal description text.

## Performance notes

- Diary reads: `(user_id, date)` composite index; day render is a single range scan.
- Search: GIN indexes (FTS expression + trigram). Measured on seeded catalog +
  10k synthetic rows (`python -m app.seed --synthetic 10000`): p95 < 40 ms locally.
- Dashboard perceived latency ≈ 0: reads come from IndexedDB live queries;
  network only hydrates in the background.
