# AppNation Chat Backend

AI-powered chat backend with runtime feature flagging. Demonstrates middleware ordering, all 5 mandatory design patterns (DI, Service, Repository, Singleton, Strategy), and a hot-reloadable feature flag system that switches behavior without redeployment.

## Stack

Node.js 22 · TypeScript 6 · Fastify 5 · Prisma 6 · PostgreSQL 16 · Zod 4 · Pino 10 · Vercel AI SDK 6 · Vitest 4 · testcontainers · Docker

---

## 1. Quick start (Docker — recommended)

Single command brings up Postgres + the API, runs migrations, seeds demo data, and starts the server:

```bash
docker compose up
```

Wait ~10 seconds. When you see `server ready`, the API is live:

- API:     http://localhost:3000
- Swagger: http://localhost:3000/docs

---

## 2. Step-by-step verification (~5 min walkthrough)

The following walks through every case study requirement using `curl`. Copy-paste each block in order.

### 2.1 Set up shared variables

The Docker stack uses a fixed dev JWT secret (`docker-dev-secret-1234567890`), so the tokens below are pre-signed for the seeded users. **Copy-paste — no install needed:**

```bash
# Demo user "Alice" (UUID matches the seeded data)
export TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6ImFsaWNlQGV4YW1wbGUuY29tIiwiaWF0IjoxNzc4MTQ2ODAxfQ.AHtfhRZqyQ3F1uAtZqq0w9kMzDQGdfMjepqp6-HP3Hg

# Demo user "Bob" — used in §2.10 to verify ownership enforcement
export BOB_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJlbWFpbCI6ImJvYkBleGFtcGxlLmNvbSIsImlhdCI6MTc3ODE0NjgwMX0.EgW_yuEkmAVpD6IjZ66JPWX6Goq6FGsjaPtpynbovzk

export APPCHECK="mock-app-check-token"
export ADMIN="dev-admin-token"
```

<details>
<summary>Want to regenerate the tokens yourself?</summary>

If you've run `npm install` locally:

```bash
export TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({ sub: '11111111-1111-1111-1111-111111111111', email: 'alice@example.com' }, 'docker-dev-secret-1234567890'))")
```

Or via the running Docker container (no host install needed):

```bash
export TOKEN=$(docker compose exec -T app node -e "console.log(require('jsonwebtoken').sign({ sub: '11111111-1111-1111-1111-111111111111', email: 'alice@example.com' }, 'docker-dev-secret-1234567890'))")
```

For manual (non-Docker) setup, replace the secret with `devsecret-replace-please-16chars` (the value in `.env.example`).

</details>

### 2.2 Endpoint 1 — list chats (paginated)

```bash
curl -s http://localhost:3000/api/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Firebase-AppCheck: $APPCHECK" | jq .
```

Expected: 3 chats for Alice, plus pagination metadata (`limit: 20`, `nextCursor: null`, `hasMore: false`).

### 2.3 Endpoint 2 — chat history

```bash
# Capture the first chat ID for the next steps
export CHAT_ID=$(curl -s http://localhost:3000/api/chats \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  | jq -r '.data[0].id')

curl -s "http://localhost:3000/api/chats/$CHAT_ID/history" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" | jq .
```

Expected: 6 chronological messages (USER ↔ ASSISTANT), one of which carries `metadata.toolCalls` (a seeded `getCurrentWeather` example).

### 2.4 Endpoint 3 — AI completion (SSE streaming)

```bash
curl -N "http://localhost:3000/api/chats/$CHAT_ID/completion" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello AppNation"}'
```

Expected: a Server-Sent Events stream:

```
event: thinking
data: {"timestamp":"..."}

event: token
data: {"text":"I am a mock AI. "}
... more token events ...

event: done
data: {"finishReason":"stop"}
```

### 2.5 Strategy pattern in action — flip `STREAMING_ENABLED` to false

Stop the server, restart with the flag off, then call the same endpoint:

```bash
docker compose down
STREAMING_ENABLED=false docker compose up -d
sleep 8

curl -s "http://localhost:3000/api/chats/$CHAT_ID/completion" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello in JSON mode"}' | jq .
```

Expected (JSON, not SSE):

```json
{
  "message": "I am a mock AI. I will respond ...",
  "toolCalls": [],
  "finishReason": "stop"
}
```

This is the `ICompletionStrategy` interface in action: zero code change, behavior switched at runtime via env flag.

### 2.6 Tool calling — flip `AI_TOOLS_ENABLED` to true

```bash
docker compose down
AI_TOOLS_ENABLED=true STREAMING_ENABLED=true docker compose up -d
sleep 8

curl -N "http://localhost:3000/api/chats/$CHAT_ID/completion" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"What is the weather in Berlin?"}'
```

Expected SSE sequence: `thinking → tool_execution(getCurrentWeather, {city:"Berlin"}) → tool_result({tempC, condition}) → token (×N) → done`. The mocked tool runs, the AI integrates the result.

### 2.7 Cursor pagination — `PAGINATION_LIMIT=10` with bulk data

```bash
docker compose down
PAGINATION_LIMIT=10 docker compose up -d
sleep 8

# Insert 15 extra chats so pagination is visible
docker exec -i $(docker compose ps -q postgres) psql -U appnation -d appnation <<'EOF'
INSERT INTO "Chat" (id, title, "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Bulk chat #' || i,
       '11111111-1111-1111-1111-111111111111',
       now() - (i * interval '1 minute'),
       now() - (i * interval '1 minute')
FROM generate_series(1, 15) i;
EOF

# Page 1 — 10 chats, hasMore=true, nextCursor present
PAGE1=$(curl -s http://localhost:3000/api/chats \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK")
echo "$PAGE1" | jq '{count: (.data|length), pagination}'
CURSOR=$(echo "$PAGE1" | jq -r '.pagination.nextCursor')

# Page 2 — remaining 8 chats, hasMore=false
curl -s "http://localhost:3000/api/chats?cursor=$CURSOR" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  | jq '{count: (.data|length), pagination}'
```

Expected: Page 1 returns 10 with `hasMore: true`, page 2 returns 8 with `hasMore: false`. Cursor is opaque base64url (`updatedAt|id`).

### 2.8 History strategy switch — `CHAT_HISTORY_ENABLED=false` returns last 10 only

```bash
# Add 12 more messages to make the difference visible
docker exec -i $(docker compose ps -q postgres) psql -U appnation -d appnation <<EOF
INSERT INTO "Message" (id, "chatId", role, content, "createdAt")
SELECT gen_random_uuid(), '$CHAT_ID', 'USER', 'bulk msg ' || i, now() - (i * interval '1 second')
FROM generate_series(1, 12) i;
EOF

# Full history (CHAT_HISTORY_ENABLED=true is default) — returns all messages
curl -s "http://localhost:3000/api/chats/$CHAT_ID/history" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  | jq '.data | length'

# Now toggle the flag and restart
docker compose down
CHAT_HISTORY_ENABLED=false docker compose up -d
sleep 8

curl -s "http://localhost:3000/api/chats/$CHAT_ID/history" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  | jq '.data | length'
```

Expected: first call returns ≥18 messages (`FullHistoryStrategy`), second returns exactly **10** (`LimitedHistoryStrategy`). Same endpoint, same data, behavior swapped via flag.

### 2.9 Route-specific feature gate — `COMPLETION_ENABLED=false`

```bash
docker compose down
COMPLETION_ENABLED=false docker compose up -d
sleep 8

curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:3000/api/chats/$CHAT_ID/completion" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"hi"}'
```

Expected: `HTTP 403` with `{"error":{"code":"FEATURE_DISABLED",...}}`. The other endpoints (`/api/chats`, `/api/chats/:id/history`) still work — proving the gate is **route-specific**, not global. This is the case study's explicit "route-specific middleware" requirement.

### 2.10 Validation, auth, ownership — error handling

```bash
docker compose down
docker compose up -d
sleep 8

# Validation error (empty prompt)
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:3000/api/chats/$CHAT_ID/completion" \
  -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  -H "Content-Type: application/json" \
  -d '{"prompt":""}'

# Missing auth (401)
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/chats \
  -H "X-Firebase-AppCheck: $APPCHECK"

# Missing app-check (403)
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/chats \
  -H "Authorization: Bearer $TOKEN"

# Bob trying to access Alice's chat (404 — ownership enforced)
curl -s -w "\nHTTP %{http_code}\n" "http://localhost:3000/api/chats/$CHAT_ID/history" \
  -H "Authorization: Bearer $BOB_TOKEN" -H "X-Firebase-AppCheck: $APPCHECK"
```

Expected: Every error returns the **same JSON envelope**:

```json
{"error":{"code":"...","message":"...","requestId":"...","timestamp":"...","details":[...]}}
```

Codes seen: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### 2.11 Rate limiting — `RATE_LIMIT_PER_MINUTE=60`

```bash
# Hammer the API; expect 60 successes + ~10 rate-limited
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/chats \
    -H "Authorization: Bearer $TOKEN" -H "X-Firebase-AppCheck: $APPCHECK"
done | sort | uniq -c
```

Expected: ~60 `200` and ~10 `429`. The 429 body uses the same envelope (`code: RATE_LIMIT_EXCEEDED`).

### 2.12 Admin flag inspection / runtime reload

```bash
# Inspect the live flag snapshot
curl -s http://localhost:3000/admin/flags -H "X-Admin-Token: $ADMIN" | jq .

# Force a reload (re-reads env + config/feature-flags.json)
curl -s -X POST http://localhost:3000/admin/flags/reload \
  -H "X-Admin-Token: $ADMIN" | jq .
```

### 2.13 Run the test suite

```bash
# Stop the running stack so testcontainers can start fresh Postgres
docker compose down

# Outside Docker (uses your local Node + the Postgres testcontainers spawns)
npm install
npm run test                # 36 tests (28 unit + 8 integration)
npm run test:coverage       # with v8 coverage report (≥80% lines)
```

Integration tests need Docker available (testcontainers spawns its own Postgres per run).

### 2.14 Browse the OpenAPI spec

Open http://localhost:3000/docs in a browser — interactive Swagger UI auto-generated from Zod schemas.

---

## 3. API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/api/chats` | JWT + AppCheck | Paginated chat list (cursor-based) |
| GET    | `/api/chats/:chatId/history` | JWT + AppCheck | Chat message history |
| POST   | `/api/chats/:chatId/completion` | JWT + AppCheck | AI completion (SSE or JSON) |
| GET    | `/admin/flags` | X-Admin-Token | Inspect current flag values |
| POST   | `/admin/flags/reload` | X-Admin-Token | Reload feature flags |
| GET    | `/health/live` | — | Process liveness probe |
| GET    | `/health/ready` | — | Full readiness probe |
| GET    | `/docs` | — | Swagger UI |

Authentication headers for `/api/*`:
- `Authorization: Bearer <jwt>` (claims: `sub`, `email`)
- `X-Firebase-AppCheck: mock-app-check-token`

Admin endpoints use `X-Admin-Token: <ADMIN_TOKEN>`.

---

## 4. Feature flags

| Flag | Type | Default | Effect |
|------|------|---------|--------|
| `STREAMING_ENABLED` | boolean | `true` | `true` → SSE stream; `false` → JSON response |
| `PAGINATION_LIMIT` | number | `20` | 10–100, max chats per page |
| `AI_TOOLS_ENABLED` | boolean | `false` | Pass `getCurrentWeather` tool to the AI provider |
| `CHAT_HISTORY_ENABLED` | boolean | `true` | `true` → full history; `false` → last 10 messages |
| `RATE_LIMIT_PER_MINUTE` | number | `60` | 1–1000, per-user (or per-IP fallback) limit |
| `COMPLETION_ENABLED` | boolean | `true` | `false` → POST `/completion` returns 403 (route-level gate) |

Three sources, in priority order:

1. Defaults (in `src/infrastructure/feature-flags/flags.ts`)
2. `config/feature-flags.json` (file override)
3. `process.env` (highest priority)

Reload at runtime without redeploy:

```bash
curl -X POST http://localhost:3000/admin/flags/reload -H "X-Admin-Token: dev-admin-token"
```

In dev, `fs.watch` on `config/feature-flags.json` triggers automatic reload on file change. Invalid config falls back to defaults (the app never crashes from a bad flag).

Adding a new flag is **one line** in `flags.ts` — type-safety, env override, defaults, reload all wire automatically.

### Switching AI providers

Three interchangeable adapters live in `src/infrastructure/ai/providers/`:

| Provider | Env | API key required |
|---|---|---|
| Mock (default) | `AI_PROVIDER=mock` | No — scripted demo responses |
| OpenAI | `AI_PROVIDER=openai` | `OPENAI_API_KEY=sk-...` |
| Gemini | `AI_PROVIDER=gemini` | `GEMINI_API_KEY=AIza...` |

Switching is a `.env` change + restart — zero code change. This is the Adapter pattern in action: services and strategies depend on `IAiProvider`, not on a concrete provider class.

### LLM Circuit Breaker

Real LLM providers (OpenAI, Gemini) are wrapped in a circuit breaker that prevents cascading failures when the provider is degraded. Mock provider is not wrapped (it cannot fail meaningfully).

| Env var | Default | Effect |
|---|---|---|
| `LLM_CIRCUIT_FAILURE_THRESHOLD` | `5` | Number of consecutive failures before the breaker trips OPEN |
| `LLM_CIRCUIT_RESET_TIMEOUT_MS` | `30000` | How long OPEN stays before allowing one probe (HALF_OPEN) |
| `LLM_CIRCUIT_FALLBACK` | `mock` | When OPEN, fall back to MockAiProvider (`mock`) or throw 503 (`throw`) |

State machine: `CLOSED → (N failures) → OPEN → (timeout) → HALF_OPEN → (success) → CLOSED` (or back to OPEN on probe failure).

### Resilience patterns

The LLM provider chain composes three decorators (Provider → Retry → CircuitBreaker → consumer):

1. **Retry with exponential backoff** — handles transient failures (network blips, 5xx, rate-limit retries) with jitter to avoid thundering herd. Configured via `LLM_RETRY_*`. Only retries pre-stream failures; once events have been yielded, mid-stream errors propagate (consumer already saw partial output).
2. **Request timeout** — `LLM_REQUEST_TIMEOUT_MS` aborts the underlying SDK call via `AbortSignal`. Aborted requests count as failures for retry/breaker accounting.
3. **Circuit breaker** — see above.

Together: transient blips are absorbed by retry; sustained failures trip the breaker; degraded service falls back to mock or returns 503.

### Health endpoints

| Path | Purpose | Auth |
|---|---|---|
| `GET /health/live` | Process is up (k8s liveness) | None |
| `GET /health/ready` | DB + flags + breaker state (k8s readiness) | None |

`/health/ready` returns **503** if any check is `down` (e.g., breaker is OPEN, DB unreachable).

### Security headers

`@fastify/helmet` is registered with default secure headers. Content-Security-Policy is intentionally disabled because Swagger UI uses inline scripts; for a JSON API backend this is a safe trade-off (CSP is primarily for HTML responses).

---

## 5. Manual setup (alternative to Docker)

```bash
# 1. Install
npm install

# 2. Start Postgres
docker run -d --name appnation-pg \
  -e POSTGRES_USER=appnation -e POSTGRES_PASSWORD=appnation -e POSTGRES_DB=appnation \
  -p 5432:5432 postgres:16-alpine

# 3. Configure
cp .env.example .env
# (edit DATABASE_URL if your Postgres is on a different port)

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run dev server (auto-reload via tsx watch)
npm run dev
```

Useful npm scripts:

| Command | What it does |
|---------|--------------|
| `npm run dev` | tsx watch — auto-reload on source change |
| `npm run build` | tsc compile to `dist/` |
| `npm start` | `node dist/server.js` (production) |
| `npm run lint` / `format` / `typecheck` | ESLint / Prettier / `tsc --noEmit` |
| `npm run test` / `test:watch` / `test:coverage` | Vitest variants |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Prisma helpers |

---

## 6. Architecture overview

**Layered structure** — routes → controller → service → repository, with a single composition root in `src/container.ts` doing manual constructor injection (no DI library).

**Mandatory patterns** (case requirement):
- **Singleton** — `Config`, `LoggerFactory`, `PrismaClientFactory`, `FeatureFlagService` (classic `getInstance()` + `resetForTesting()` for isolation)
- **Service** — `ChatService`, `AiCompletionService` (orchestration, flag-aware, framework-agnostic)
- **Repository** — `ChatRepository`, `MessageRepository` implement `IChatRepository` / `IMessageRepository`; services depend on interfaces
- **Dependency Injection** — manual constructor injection; entire dependency graph in one file (`container.ts`)
- **Strategy** — `ICompletionStrategy` (Streaming vs Json) + `IHistoryStrategy` (Full vs Limited), each with a `Selector` reading flags per request

**Bonus patterns** (added on top):
- **Adapter** — `IAiProvider` with three swappable adapters (Mock, OpenAI, Gemini)
- **Decorator** (chained) — `RetryAiProvider` + `CircuitBreakerAiProvider` wrapping real providers in a resilience chain

**Request flow:** `onRequest hooks (logContext → appCheck → auth → clientType) → Zod validation → preHandler (rateLimit) → handler → service → strategy → repository → response (or SSE stream) → setErrorHandler maps any thrown error to consistent JSON envelope`.

**Error envelope** (consistent across all error types):
```json
{"error":{"code":"...","message":"...","requestId":"...","timestamp":"...","details":[...]}}
```

Status codes: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN` / `FEATURE_DISABLED`, 404 `NOT_FOUND`, 429 `RATE_LIMIT_EXCEEDED`, 500 `INTERNAL_ERROR`, 503 `SERVICE_UNAVAILABLE`.

---

## 7. Project layout

```
src/
  server.ts                    # Bootstrap, lifecycle, graceful shutdown
  container.ts                 # Composition root (manual DI wiring)
  infrastructure/              # Singletons + AI providers
    config/                    # Config singleton + Zod env schema
    logger/                    # Pino structured logger with redaction
    database/                  # Prisma client lifecycle management
    feature-flags/             # FeatureFlagService + flags.ts (KEY)
    ai/
      providers/               # IAiProvider + Mock + OpenAI (Vercel AI SDK)
      tools/                   # getCurrentWeather + tool registry
  repositories/                # IChat / IMessage interfaces + Prisma impls
  services/                    # ChatService, AiCompletionService
  strategies/                  # Strategy pattern (KEY)
    completion/                # Streaming vs JSON + Selector
    history/                   # Full vs Limited (last 10) + Selector
  controllers/                 # Thin HTTP adapters
  routes/                      # chat / completion / admin
  middleware/                  # appCheck, auth, logContext, clientType,
                               # featureFlag, rateLimit, errorHandler
  schemas/                     # Zod request/response (single source of truth)
  errors/                      # AppError hierarchy
prisma/
  schema.prisma                # User, Chat, Message + indexes + enum
  migrations/
  seed.ts
tests/
  unit/                        # Strategies, services, flags, errors
  integration/                 # Real Postgres via testcontainers
config/
  feature-flags.json           # Optional file override for flags
.github/workflows/ci.yml       # Lint + typecheck + test on push/PR
docker-compose.yml             # Postgres + app, single-command startup
Dockerfile                     # Multi-stage build (builder + slim runner)
```

---

## 8. What this codebase demonstrates

For each case study requirement:

| Requirement | Where to look |
|---|---|
| **Middleware ordering** | `src/server.ts` (registration order) + `src/middleware/` |
| **DI Pattern** | `src/container.ts` — entire dependency graph in 80 lines, no library magic |
| **Service Pattern** | `src/services/{ChatService,AiCompletionService}.ts` — framework-agnostic |
| **Repository Pattern** | `src/repositories/interfaces/` + Prisma implementations |
| **Singleton Pattern** | 4 textbook `getInstance()` examples in `src/infrastructure/{config,logger,database,feature-flags}/` |
| **Strategy Pattern** | `src/strategies/{completion,history}/` with selectors that read flags per request |
| **Configuration** | `src/infrastructure/config/{Config,env}.ts` — Zod env schema with fail-fast validation |
| **DB connection mgmt** | `src/infrastructure/database/PrismaClient.ts` (lifecycle) + URL pool params |
| **Logging** | `src/infrastructure/logger/Logger.ts` — Pino structured + redaction + levels |
| **Feature flagging** | `src/infrastructure/feature-flags/` — type-safe API, multi-source, reload |
| **Route-specific gates** | `src/routes/completion.routes.ts` `preHandler: [requireFeatureFlag(...)]` |
| **Cursor pagination** | `src/repositories/ChatRepository.ts` (composite-key cursor + index match) |
| **SSE streaming** | `src/strategies/completion/StreamingCompletionStrategy.ts` (with error path) |
| **Mocked tool** | `src/infrastructure/ai/tools/getCurrentWeather.ts` |
| **Vercel AI SDK** | `src/infrastructure/ai/providers/{OpenAiProvider,GeminiProvider}.ts` (3 swappable adapters) |
| **Error handling** | `src/middleware/errorHandler.ts` + `src/errors/` — consistent envelope |
| **Tests** | 28 unit + 8 integration; `npm run test` |
| **Docker** | `Dockerfile` (multi-stage) + `docker-compose.yml` |
| **CI** | `.github/workflows/ci.yml` — lint + typecheck + test against Postgres service |
