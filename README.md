# BuildStax

BuildStax is an authenticated sales and delivery workspace for finding local
businesses without an effective website, managing phone-first outreach,
enforcing quote floors, collecting payment, publishing customer previews, and
handling revisions in one accountable thread.

## Product surface

- Command center with pipeline health, due work, revenue, conversion, and
  automation evidence.
- Searchable pipeline with campaign and stage filters, validated manual entry,
  protected transitions, and permanent do-not-call enforcement.
- Business workspace for calls, requirements, quotes, Stripe Checkout,
  project builds, customer feedback, revisions, delivery, and audit history.
- Campaign management with versioned pitches and an immutable effective price
  floor of `max(configured floor, 2 x estimated delivery cost)`.
- Tokenized public previews with industry-specific content and images, gated
  publication, persisted customer feedback, and revision counts.
- Integration readiness for InsForge, Zero, Nexla, OpenAI Realtime, AkashML,
  Stripe, Pomerium Zero, and the explicit SQLite fallback.
- Loading, empty, validation, denied, failure, success, not-found, desktop, and
  mobile states across every primary flow.

The source of truth for product intent is
[buildstax-system-transcript.md](buildstax-system-transcript.md); provider and
safety boundaries are in [AGENTS.md](AGENTS.md).

## Architecture

- Next.js App Router, React, TypeScript, Tailwind CSS, Radix UI, and Lucide.
- A custom Node HTTP server hosts Next.js and the authenticated Plivo media
  WebSocket upgrade, bridging call audio to the configured realtime model.
- InsForge authentication and Postgres as the primary system of record, with
  tenant-scoped RLS, SQL constraints, guarded workflow RPCs, and audit rows.
- Stripe-hosted Checkout with an InsForge-managed webhook. A database trigger
  validates provider metadata, quote ownership, currency, amount, environment,
  and idempotency before it records payment or advances delivery state. The
  browser success redirect is never payment evidence.
- Nexla webhook ingestion into a transformed Nexset plus a governed MCP toolset
  for durable agent context. Every MCP read returns a receipt and trace.
- Zero MCP discovery and runner execution behind intent-specific provider,
  health, schema, and spend policies. Paid calls require a fresh search and
  inspection and are reviewed after execution.
- AkashML for schema-constrained, operator-reviewed pitch challengers; OpenAI
  Realtime is the voice-inference boundary behind the Plivo media bridge.
- Pomerium Zero as the identity-aware access proxy, with replica health plus
  route and policy attachment verified through its management API.
- Drizzle and file-backed SQLite as an explicit offline evaluation fallback,
  never an automatic production substitute.

All trusted mutations run server-side with Zod validation, authenticated
workspace context, duplicate protection, state-machine checks, and safe error
messages. Security headers, CSP, HTTP-only sessions, public-feedback limits,
least-privilege RLS, and untrusted-content boundaries are built in.

## Run locally

Requires a current Node.js LTS-compatible release and Docker Desktop for the
Pomerium replica.

```bash
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The linked environment uses
InsForge signup, email verification, and login. To evaluate without external
services, set `DATA_BACKEND=sqlite` and `APP_MODE=sandbox`; the login screen then
shows the local sandbox identity. SQLite data persists under `data/`.

## Backend setup

The repository is linked to an InsForge project through `.insforge/project.json`.
For a fresh operator environment, authenticate and link without placing the
user API key in a tracked file, then apply all migrations:

```bash
npx @insforge/cli current
npx @insforge/cli db migrations up --all
npm run backend:configure
npm run backend:mcp:verify
```

`backend:configure` reads the linked project plus the configured Nexla resource
IDs and writes an owner-readable, ignored `.env.local`. The InsForge MCP check
uses the official server to fetch its instructions and metadata, inspect the
payment table, and execute a read-only verification query.

Nexla resources are managed with `nexla-cli`; run `schema <resource>.<verb>` and
`--dry-run` before every mutation. The configured source, transformed Nexset,
and active toolset can be verified through the governed MCP gateway:

```bash
npm run nexla:mcp:verify
```

Start the Pomerium Zero replica after its cluster and management values are
configured:

```bash
npm run pomerium:up
docker compose --env-file .env.local -f compose.pomerium.yaml ps
```

## Environment

Use [.env.example](.env.example) as the non-secret contract. Required groups:

| Area | Variables |
| --- | --- |
| App | `APP_MODE`, `DATA_BACKEND`, `APP_URL`, `AUTH_SECRET` |
| InsForge | `NEXT_PUBLIC_INSFORGE_URL`, `NEXT_PUBLIC_INSFORGE_ANON_KEY`, `INSFORGE_API_KEY` |
| Stripe | `STRIPE_ENVIRONMENT`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_ENDPOINT_ID` |
| Nexla | `NEXLA_API_URL`, `NEXLA_SERVICE_KEY`, `NEXLA_TOKEN`, `NEXLA_INGEST_URL`, `NEXLA_SOURCE_ID`, `NEXLA_NEXSET_ID`, `NEXLA_TOOLSET_ID` |
| Zero | `ZERO_RUNNER`, `ZERO_SESSION_TOKEN`, `ZERO_LIVE_ACTIONS` |
| Voice | `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_TEST_NUMBER`, `PLIVO_PRIMARY_NUMBER`, `PLIVO_TEST_DESTINATION`, `PLIVO_PUBLIC_BASE_URL`, `PLIVO_STREAM_SECRET`, `PLIVO_LIVE_CALLS_ENABLED`, `PLIVO_MAX_CALL_SECONDS`, `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE` |
| Voice override | `VOICE_AGENT_WS_URL`, `VOICE_AGENT_API_KEY`, `VOICE_AGENT_MODEL`, `VOICE_AGENT_VOICE_ID` |
| Models | `AKASHML_API_KEY`, `AKASHML_MODEL` |
| Pomerium | `POMERIUM_CLUSTER_TOKEN`, `POMERIUM_HEALTH_URL`, `POMERIUM_ZERO_API_TOKEN`, `POMERIUM_ZERO_ORGANIZATION_ID`, `POMERIUM_ZERO_NAMESPACE_ID`, `POMERIUM_ZERO_POLICY_ID`, `POMERIUM_ZERO_ROUTE_ID`, `POMERIUM_ZERO_ROUTE_URL`, `POMERIUM_UPSTREAM_URL` |
| SQLite fallback | `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD_HASH` |

Only the InsForge URL, anonymous key, and Stripe publishable key may be exposed
to browser code. Keep every service, management, session, and secret key in
ignored server configuration. Use `APP_MODE=production` and HTTPS before any
live payment mode; sandbox mode permits Stripe test charges only.

## Deployment

The production image runs the custom `tsx server.mts` process directly as a
non-root user. It contains production-only application dependencies, the full
Next.js build and public assets, and exposes `GET /api/health` on the same port
as the Plivo WebSocket upgrade:

```bash
npm run build
docker build -t buildstax .
docker run --name buildstax --rm -p 3000:3000 --env-file .env.local --env ZERO_RUNNER=/usr/local/bin/zero buildstax
```

Place the app behind the verified Pomerium route, keep InsForge RLS enabled,
rotate provider keys through their control planes, and persist SQLite only when
deliberately using the fallback. Do not enable `ZERO_LIVE_ACTIONS` until the
runner has an authenticated funded identity and the selected intent policies
have been reviewed. The image pins the Zero runner at `1.26.0`; inject a
short-lived `ZERO_SESSION_TOKEN` through the deployment secret manager at
runtime, never through a Docker build argument or image layer. For local
development outside the container, point `ZERO_RUNNER` at the provisioned host
binary instead. The public route must preserve HTTP/1.1 WebSocket upgrades for
`/voice/plivo`, and `PLIVO_PUBLIC_BASE_URL` must match that externally reachable
HTTPS origin. Deployments should allow at least 10 seconds for `SIGTERM`
shutdown so active media sockets receive a close frame.

The custom server intentionally uses the regular Next.js production output.
Do not enable Next.js standalone output: it does not trace custom server files
and is incompatible with this WebSocket entrypoint.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run backend:mcp:verify
npm run nexla:mcp:verify
npm audit
```

The browser suite covers invalid and valid auth, protected routes, lead entry,
price-floor rejection, feedback validation, health, desktop and mobile layout,
viewport overflow, and serious or critical Axe findings. Current Zero research,
prices, schemas, calls, and review boundaries are recorded in
[docs/zero-provider-research.md](docs/zero-provider-research.md).
