# BuildStax Full Hackathon Audit

Audit date: 2026-07-17

## Executive verdict

BuildStax is a credible, well-designed operator control plane, not yet a complete
autonomous website-sales and delivery system. Its strongest work is the
InsForge data model, guarded workflow RPCs, payment verification, DNC controls,
and polished responsive operations UI. Its weakest work is the actual product
promise: the visible prospecting and build-agent demos are simulations, email
is not implemented, the self-improving loop is not closed, Zero is not
authenticated for execution, and the configured OpenAI project currently
rejects GPT Realtime inference for exhausted quota.

Current win readiness: **5.9/10**. This can become competitive, but it is not
honestly win-ready today. A flawless demo of the full call-to-live-site story
would move it into finalist territory; showing the current Build Studio as if it
were a real agent is more likely to lose judge trust than gain points.

## Original intent versus delivered system

| Original design promise | Current delivered state | Assessment |
| --- | --- | --- |
| 0.xyz chooses and connects phone, email, data, and tools | Zero has guarded discovery code and a researched capability catalog, but no authenticated runtime identity and no live email/site/QA execution | Major gap |
| Nexla is the data layer and persistent memory | InsForge became the source of truth; Nexla receives governed context through a webhook source, transformed Nexset, and six-tool MCP toolset | Useful evolution, but narrower than promised |
| Pomerium prevents prompt injection and protects data flow | Pomerium Zero provides identity-aware access and verified policy attachment; prompt injection is handled separately with schemas and tool boundaries | Corrected architecture; docs should stop implying proxy equals prompt-injection defense |
| GPT Realtime runs natural phone conversations | Plivo transport, signed callbacks, bidirectional PCMU bridge, and `gpt-realtime-2.1` tooling are deployed; live inference fails on OpenAI quota | Connected but blocked |
| Agents find businesses without websites | A live Zero discovery action exists behind spend controls; the visible Prospecting surface replays local fixture data | Partial |
| Phone call is always first contact | Workflow and database guards enforce call-first and permanent DNC behavior | Strong |
| Follow-up email carries quote and requirements | No email send, inbox, thread, reply, or revision-mail runtime exists | Missing |
| Adaptive pricing respects delivery cost | Database enforces the greater of configured floor and 2x estimated cost | Strong |
| Stripe payment gates website creation | Test Checkout and InsForge webhook fulfillment are verified; live Stripe is unconfigured | Strong demo path, not production |
| Platform agent builds and publishes the site | The Build Studio animates progress over industry templates and a shared preview route; it does not create files, run an agent, perform QA, or deploy a customer site | Critical gap |
| Sales pitch improves from conversion data | AkashML produces schema-validated challenger copy, but no experiment assignment, outcome attribution, winner selection, or automatic promotion loop exists | Partial |
| One email thread handles ongoing revisions | Preview feedback persists, but there is no durable customer email inbox or thread continuation | Missing |

## Verified live state

| Product | What is genuinely verified | Missing or blocked | Score |
| --- | --- | --- | ---: |
| InsForge | Active project; auth; 16 public tables; RLS; guarded RPCs; audit/outbox; telephony schema; Stripe test fulfillment | Duplicate demo workspaces need cleanup; no deployed worker drains all outbox events | 9.0 |
| Nexla | Source, transformed Nexset, active governed toolset, six MCP tools, context read with receipt and trace | Transcript/requirements ingestion is indirect; no automated retry worker or outcome analytics loop | 7.5 |
| Zero | Runner installed; search works; intent catalog, schema checks, caps, and discovery action exist | `authMethod=none`; paid execution disabled; no current search-get-fetch-review proof from the app | 4.0 |
| OpenAI Realtime | Key can list `gpt-realtime-2.1`; deployed WebSocket bridge reaches the model endpoint; intake tool is defined | Live session returns quota-exceeded before audio | 5.0 |
| Plivo | Two voice-enabled numbers; dedicated BuildStax application; primary number attached; signed inbound webhook, session creation, bidirectional XML, and WebSocket token verified | A successful real PSTN audio conversation still depends on OpenAI quota | 8.0 |
| AkashML | Live model catalog and one successful structured challenger run with spend reservation | Used only for pitch drafting; no evaluation or optimization loop | 8.0 |
| Stripe | Test account, product, prices, webhook, environment guard, and verified fulfillment evidence | No live-mode account; customer email delivery of checkout link is missing | 8.0 |
| Pomerium Zero | Local replica healthy; management API previously verified namespace, route, policy, and attachment | External route was unreachable during this audit; Plivo webhooks correctly require a separate public route | 6.0 |
| Platform build agent | Attractive preview templates and payment-gated project records | No actual code-generation worker, isolated build environment, artifact store, deployer, screenshot/SEO/security QA, or rollback | 3.0 |
| Email | Zero candidates and policy exist in documentation | No provider call, sender identity, inbox, thread ID, unsubscribe handling, bounce tracking, or revision loop | 1.0 |

## Hackathon scorecard

| Category | Score | Why |
| --- | ---: | --- |
| Problem and market clarity | 8.5/10 | Clear buyer, painful workflow, and measurable revenue outcome |
| Originality | 7.5/10 | Phone-first autonomous website sales is memorable; generic CRM screens dilute it |
| Technical architecture | 8.0/10 | Good boundaries, state machines, RLS, idempotency, payment verification, and signed media transport |
| Functional completeness | 5.0/10 | The middle is strong, but acquisition, email, generation, deployment, and revision automation are incomplete |
| Sponsor-product depth | 6.5/10 | InsForge and AkashML are strong; Nexla is credible; Zero, Pomerium, and Realtime do not yet complete the live story |
| AI/agent quality | 5.5/10 | Structured challenger and voice-tool design exist; the core build agent and improvement loop do not |
| Security and responsible automation | 8.5/10 | DNC, price floors, payment gates, signature validation, least privilege, caps, and untrusted-input boundaries are unusually good |
| UX and visual design | 8.0/10 | Dense, polished, responsive, accessible operations interface; simulated states need explicit labels |
| Demo credibility | 4.5/10 | Static prospecting/build animations and failed Realtime quota undermine the headline claim |
| Testing and engineering quality | 8.0/10 | Lint, typecheck, 28 unit tests, build, audit, and 13 isolated Playwright tests pass; provider contract tests remain thin |
| Business viability | 6.5/10 | Pricing guard and fulfillment model are plausible; acquisition legality, margins, support load, and site hosting costs need proof |

Weighted overall: **5.9/10 in its current demo state**.

## Documentation and demo audit

- `buildstax-system-transcript.md` is a useful and accurate record of the
  original idea. Keep it immutable and treat later decisions as an explicit
  delta, not a rewrite.
- `README.md` is technically detailed but overstates the site-generation and
  deployment path. “Platform build adapter” and “assemble, render, check, and
  launch” currently describe a UI simulation, not a worker.
- `docs/zero-provider-research.md` is a good dated research artifact. Its funded
  runner evidence is historical; the current host reports no authenticated Zero
  identity, so the document must not be used as current readiness proof.
- The Prospecting UI clearly says local fixtures, which is honest, but its
  animation can still be mistaken for a live browser agent.
- The Build Studio is the riskiest demo element. It displays invented files,
  agent logs, and progress while only changing client-side state. Label it as a
  recorded prototype until the worker exists, or replace it with real job logs.
- There is no submission narrative, demo script, architecture decision record,
  threat model, cost model, evaluation report, or judge-facing evidence matrix.

## Immediate recovery plan

### P0: make the headline demo true

1. Restore usable quota on the configured OpenAI project and rerun the deployed
   signed WebSocket smoke until at least one `playAudio` frame is observed from
   `gpt-realtime-2.1`.
2. Authenticate Zero, keep `ZERO_LIVE_ACTIONS=false` until the identity and
   balance are verified, then run one capped lead-discovery call through the
   application and retain its run ID and review.
3. Implement a real build worker in an isolated compute service. It must consume
   a paid project, read the caller-confirmed Nexla context, generate a repository,
   run tests, capture screenshots, publish a preview, and persist artifact and
   deployment IDs.
4. Implement transactional email plus a persistent inbox/thread. Send the quote
   and Stripe link only after a completed call; keep every revision reply in the
   same provider thread.
5. Record one uncut demo: call the number, save the business brief, send the
   quote, complete Stripe test checkout, build a real site, open the deployed
   preview, submit feedback, and show the revision in the same email thread.

### P1: make every sponsor product indispensable

1. Use Zero for capability selection and bounded execution of discovery, email,
   screenshot, SEO, and header QA. Persist search result, inspected schema, price,
   run ID, and review for every paid call.
2. Use Nexla for normalized call transcripts, customer requirements, email
   threads, build artifacts, QA findings, and outcome events. Add a durable
   outbox worker with retry and dead-letter visibility.
3. Use Pomerium only for operator/admin access. Keep Plivo, Stripe, and public
   preview callbacks on narrowly scoped signed public routes. Describe schema
   validation and tool allowlists, not Pomerium, as prompt-injection controls.
4. Use AkashML to score challenger pitches against a fixed rubric, summarize
   objections, and propose variants. Keep promotion operator-approved until the
   experiment has enough attributed outcomes.
5. Use InsForge as the canonical workflow ledger: every provider call, cost,
   approval, artifact, state transition, and failure must be represented there.

### P2: turn the prototype into a defensible product

1. Add consent and jurisdiction-aware outbound calling rules, calling-hour
   limits, suppression-list imports, recording disclosure, and retention policy.
2. Add real unit economics: phone minutes, Realtime audio tokens, Zero calls,
   model runs, human review, hosting, revisions, refunds, and support.
3. Add model/provider evals for interruption, noisy calls, email capture,
   hallucinated claims, DNC recognition, tool failure, and adversarial business
   content.
4. Add deployment ownership, custom domains, rollback, backups, monitoring,
   alerts, and a customer handoff/export path.
5. Remove duplicate demo tenants and make demo seeding deterministic and
   isolated from linked production data.

## Honest demo positioning

Today, present BuildStax as **a secure control plane and deployed voice-intake
foundation for agentic website sales**, not as a finished autonomous agency.
The project can possibly win only after the uncut P0 flow succeeds. The strongest
pitch is not the number of logos; it is the auditable chain from a real phone
conversation to a paid, deployed, revised website, with every side effect
policy-gated and attributable.
