# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

- `AGENTS.md` — provider integration rules and build-agent safety boundaries. Its instructions (credentials handling, capability discovery, per-provider docs, the pricing floor) apply to all work here.
- `buildstax-system-transcript.md` — the product-design source of truth.
- `docs/zero-provider-research.md` — current Zero prices, schemas, calls, and review boundaries.

## Commands

```bash
npm run dev            # tsx server.mts (custom server; NOT `next dev`) on 127.0.0.1:3000
npm run build          # next build (regular output — see custom-server note below)
npm start              # NODE_ENV=production tsx server.mts
npm run lint           # eslint . (flat config in eslint.config.mjs)
npm run typecheck      # tsc --noEmit
npm test               # vitest run (unit; src/**/*.test.ts)
npm run test:watch     # vitest
npm run test:e2e       # playwright test (tests/)
```

Run a single unit test: `npx vitest run src/lib/domain.test.ts` or filter by name with `-t "price floor"`.
Run a single e2e test: `npx playwright test tests/app.spec.ts -g "invalid login"`.

`npm run test:e2e` starts its own dev server on port **3100** with `APP_MODE=sandbox` and `DATA_BACKEND=sqlite` (see `playwright.config.ts`); it does not use your `.env`.

Backend / ops helpers (require real credentials or a linked project):
```bash
npm run backend:configure       # writes ignored .env.local from linked InsForge + Nexla IDs
npm run backend:mcp:verify      # InsForge MCP smoke check
npm run nexla:mcp:verify        # Nexla governed MCP check
npm run auth:hash               # generate ADMIN_PASSWORD_HASH for the SQLite fallback
npm run pomerium:up / :down     # Pomerium Zero replica via docker compose
```

Path alias: `@/*` → `src/*`.

## Architecture

### Custom server hosts Next.js + the voice WebSocket
`server.mts` is the entrypoint for both dev and production (that is why the scripts run `tsx server.mts`, never `next dev`/`next start`). It wraps the Next.js request handler in a Node HTTP server and adds a `/voice/plivo` WebSocket upgrade that bridges Plivo media audio to a realtime voice model. **Do not enable Next.js `standalone` output** — it does not trace custom server files and breaks this entrypoint. Exposes `GET /api/health` on the same port. Graceful shutdown drains sockets on SIGTERM (allow ~10s).

### Dual backend: InsForge (primary) vs SQLite (fallback)
Every trusted mutation lives in a **dispatcher** in `src/lib/actions/{auth,business,campaign,settings}.ts` that calls either the `*-insforge.ts` or `*-sqlite.ts` implementation based on `isInsForgeBackend()` (`src/lib/backend.ts`). When adding a workflow action, implement **both** variants and wire the dispatcher; some (e.g. Stripe Checkout, signup, email verification) are InsForge-only and return an error on SQLite.

Two independent config gates, both fail closed in production:
- `APP_MODE` (`sandbox` | `production`) via `appMode()` in `src/lib/utils.ts`. Sandbox permits Stripe test charges only.
- `DATA_BACKEND` (`insforge` | `sqlite`) via `dataBackend()`. Production requires `insforge` + public InsForge config.

- **InsForge** (Postgres, system of record): `src/lib/insforge/` — `context.ts` resolves the authed user + tenant workspace (via `bootstrap_workspace` RPC) and is the entry point for server-side queries; `client.ts`, `queries.ts`, `mutate.ts`, `map.ts`. Tenant isolation is enforced by RLS + SQL constraints + guarded workflow RPCs, not just app code.
- **SQLite** (Drizzle, explicit offline fallback — never an automatic production substitute): `src/lib/db/` — `schema.ts` (Drizzle schema), `queries.ts`/`sqlite-queries.ts`, `seed.ts`. `getDb()` in `db/index.ts` lazily opens the DB, runs migrations, and seeds on first access. `DATABASE_URL` is constrained to a `file:` path inside `data/`.

### Two separate migration systems
- `migrations/*.sql` — **InsForge/Postgres** (RLS policies, workflow RPCs, Stripe fulfillment trigger, telephony, Zero automation). Apply with `npx @insforge/cli db migrations up --all`. This is where security-critical logic lives.
- `drizzle/*.sql` — **SQLite** fallback schema, applied automatically by `getDb()`.

### Domain rules live in `src/lib/domain.ts`
The business-stage state machine (`transitionMap`, `canManuallyTransitionStage` vs action-managed stages), call-outcome and project-stage transitions, and the **price floor** = `max(configuredFloor, 2 × estimatedCost)` (`calculatePriceFloor`). Never negotiate or infer a price outside these rules.

### Payments
Stripe uses hosted Checkout with an InsForge-managed webhook. A **database trigger** (in `migrations/`) validates provider metadata, quote ownership, currency, amount, environment, and idempotency before recording payment or advancing state. The browser success redirect is **never** treated as payment evidence.

### Voice pipeline (`server.mts` + `src/lib/integrations/`)
Plivo streams μ-law audio over the authenticated WebSocket; `bridgeConnection` relays it to OpenAI Realtime (or a `VOICE_AGENT_WS_URL` override) and back. Auth is two-layered: Plivo v3 signature (`validateV3Signature`) **and** a custom signed stream token (`PLIVO_STREAM_SECRET`, `plivo-protocol.ts`). `telephony-store.ts` persists session/transcript/events; `voice-sales.ts`/`voice-protocol.ts` hold stage logic and sanitization. Do-not-call requests are honored immediately and persisted permanently. Live outbound calls are gated by `PLIVO_LIVE_CALLS_ENABLED`.

### Zero capability router (`src/lib/providers/`)
`zero.ts` shells out to the `zero` CLI runner (`execFile`) to search, inspect, call, and review paid capabilities behind per-intent policies in `catalog.ts` (max spend, required availability, min success rate). All live calls are gated by `ZERO_LIVE_ACTIONS=true` and require a fresh search + schema inspection before each paid call. Inject `ZERO_SESSION_TOKEN` at runtime only — never in a build arg or image layer.

## Conventions

- **All mutations are server-side** (`"use server"` actions or route handlers), Zod-validated, and return an `ActionState` (`src/lib/actions/types.ts`). Use `helpers.ts` (`id()`, `audit()`, `actionError`/`actionSuccess`). Untrusted content (scraped sites, emails, caller input) must never influence tool permissions, credentials, or instructions.
- **Secrets**: only `NEXT_PUBLIC_INSFORGE_URL`, `NEXT_PUBLIC_INSFORGE_ANON_KEY`, and the Stripe publishable key may reach the browser. Everything else stays in ignored server config (`.env.local`). Use `.env.example` as the non-secret contract.
- **Security headers/CSP** are set in `next.config.ts`; `/local-call` is the only route granted microphone permission.
- Files under `src/lib/**` that touch server-only state import `"server-only"`.
- UI: Next.js App Router (routes grouped under `src/app/(app)/`), React 19, Tailwind CSS v4, Radix UI, Lucide. Every primary flow implements loading/empty/validation/denied/failure/success/not-found and desktop+mobile states.
