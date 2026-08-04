# Dograh local calling — secondary voice-agent option

**Date:** 2026-07-17
**Status:** Approved (design)

## Summary

Add a **secondary, browser-based** way to place a BuildStax sales voice-agent call,
powered by a **self-hosted, local [Dograh](https://www.dograh.com/)** instance. It
behaves like the primary Plivo phone call (same sales persona and price-floor rules)
but needs no telephony: the operator opens it per-business, talks to the agent live in
the browser, and sees that business's brief and floor-safe offer on screen. The
existing Plivo phone path and the existing OpenAI-Realtime `/local-call` intake page are
left untouched.

## Why this shape (Dograh constraints)

Dograh exposes two integration surfaces, and they are mutually exclusive on per-call
context:

| | Web Call widget (browser) | Trigger API (`POST /api/v1/public/agent/{uuid}`) |
|---|---|---|
| Runs in-browser, no telephony | Yes (`dograh-widget.js`) | No — places a **phone** call |
| Auto-inject per-business context | **No** — `start()` takes no args; agent identity is baked into the dashboard snippet | Yes — `initial_context` → `{{vars}}` |
| Needs Dograh telephony | No | Yes |

Because the request is explicitly a **local** calling option, we use the **Web Call
widget** and recover "per-business" by (a) showing the business's brief/offer on-screen
as the operator's script and (b) running one shared sales agent that embodies the
`voice-sales.ts` persona. Automatic per-business variable injection is **not possible**
via the local widget and is out of scope.

## Decisions

- **Mode:** Dograh **inline** widget (`<div id="dograh-inline-container">`) so Dograh
  renders the live call + transcript UI; BuildStax renders the context panel beside it.
  (Headless mode is the fallback if full BuildStax styling is later wanted.)
- **Placement:** a dedicated, authenticated, tenant-scoped route
  `/(app)/businesses/[id]/local-call`, opened by a "Call locally" button on the business
  page next to "Call now". Keeps the microphone + Dograh CSP exceptions scoped to one
  route, consistent with the "`/local-call` is the only mic route" convention.
- **Gating:** non-production only (`NODE_ENV !== "production"`) **and**
  `DOGRAH_LOCAL_CALLS_ENABLED=true` **and** a configured widget script URL. Dograh runs
  locally, so this never activates in production.
- **No secrets in the browser:** the widget authenticates by **domain allowlisting**, so
  no API key is sent client-side. The non-secret embed config (script URL, dashboard
  attributes, origin) is read server-side and passed to the client component as props —
  not exposed as `NEXT_PUBLIC_*`.
- **Read-only (Phase 1):** no new mutations, so no InsForge/SQLite dispatcher. The
  business is read via the existing `getBusinessDetail` (tenant-scoped, dual-backend).
  Outcomes are logged with the existing "Log call" dialog.

## Components

1. `src/lib/integrations/dograh.ts` (`"server-only"`)
   - `dograhLocalCallConfig(env?)` → `{ enabled, scriptUrl, attrs, origin }`.
   - `isDograhLocalCallsEnabled(env?)` → boolean (flag && scriptUrl && not production).
   - `dograhCspOrigins(env?)` → string[] (http origin + ws/wss variant) for CSP; `[]`
     when disabled/unset.
   - `attrs` parsed from `DOGRAH_WIDGET_ATTRS` (JSON of extra `<script>` attributes copied
     from the dashboard snippet, e.g. agent id / mode); invalid JSON → `{}`.
   - `origin` from `DOGRAH_ORIGIN`, else derived from the script URL's origin.

2. `src/app/(app)/businesses/[id]/local-call/page.tsx` — server component:
   auth via the `(app)` layout; loads business + workspace; computes offer/enforced floor
   exactly like the business page / `getVoiceBusinessContext`
   (`enforced = max(configuredFloor, 2×estimatedCost)`, `offer = max(enforced, openQuote)`).
   Renders the states below.

3. `src/components/local-call/dograh-local-call.tsx` — client component: injects the
   Dograh script (with dashboard attrs) once, renders `#dograh-inline-container` + the
   BuildStax context panel; handles script-load failure; ends any active call and removes
   the script on unmount.

4. `src/components/business/business-actions.tsx` — `DograhLocalCallButton` (a
   `buttonVariants`-styled `<Link>` to the route), disabled for `doNotCall` / non-callable
   stages, rendered only when Dograh is enabled.

5. `src/app/(app)/businesses/[id]/page.tsx` — render `DograhLocalCallButton` next to
   `PlivoCallDialog`, gated by `isDograhLocalCallsEnabled()`.

6. `next.config.ts` — grant `microphone=(self)` and add the Dograh origin to CSP
   (`script-src`, `connect-src` incl. ws/wss, `frame-src`, `worker-src`, `media-src`,
   `img-src`, `style-src`, `font-src`) for `"/businesses/:id/local-call"` **only when
   Dograh is configured**; extend the catch-all negative lookahead to `(?!.*local-call$)`
   so the route never double-matches the restrictive header set.

7. `.env.example` — document `DOGRAH_LOCAL_CALLS_ENABLED`, `DOGRAH_WIDGET_SCRIPT_URL`,
   `DOGRAH_WIDGET_ATTRS`, `DOGRAH_ORIGIN` (all non-secret).

8. `docs/dograh-local-call.md` — run Dograh locally (`docker compose`), build the
   "BuildStax Website Sales" agent (system prompt ported from `buildVoiceSalesInstructions`),
   set Allowed Domains to the BuildStax dev origin, copy the embed attributes into the env.

## States (loading / empty / denied / disabled / blocked / not-found / failure / success)

- **disabled** (prod or flag off / no script URL): explanatory card, no widget, no mic.
- **blocked** (`doNotCall` or non-callable stage): message, no widget.
- **not-found** (bad/foreign id): `notFound()` (tenant-scoped read returns null).
- **widget-load-failure / mic-denied:** surfaced in the client component.
- **success:** live inline Dograh call beside the business context panel.
- Desktop + mobile layouts.

## Testing

- `src/lib/integrations/dograh.test.ts`: `enabled` gating (prod off, flag off, missing
  URL), `attrs` JSON parse (valid/invalid), origin derivation, `dograhCspOrigins`, and
  that no secret-bearing fields are returned.
- Manual/e2e (sandbox, no live Dograh): the route renders the **disabled** card when the
  flag is off; the button is hidden when disabled and disabled for `doNotCall`.

## Out of scope (Phase 2 / stretch)

- Pulling the Dograh **run** transcript/recording back into the business `calls` log
  (needs a server-side Dograh API key + web-call→business correlation the widget does not
  expose). For now the transcript lives in the Dograh dashboard; outcomes are logged via
  the existing "Log call" dialog.
