# Zero Capability Research

Research date: 2026-07-17

BuildStax uses Zero as a runtime capability router, not as a list of hardcoded
endpoints. The live path must repeat `search -> get -> fetch -> review`, enforce
the intent-specific spend cap, and reject results without a usable schema.

Discovery and schema inspection were repeated through both the Zero MCP connector
and the local runner. The connector authorized a short-lived runner session with
a funded managed wallet. Two capped `$0.01` LION calls were reviewed: the first
surfaced an undocumented category constraint; the corrected Oakland retail call
returned 25 records, 16 without a website field. No outreach capability was
executed. Marketplace results remain discovery evidence until BuildStax qualifies
the returned business and an operator approves a live action.

| Intent | Current strongest candidate | Observed price | Evidence and decision |
| --- | --- | ---: | --- |
| Lead discovery | LION POI Business Search | $0.01/call | Healthy and executed with a $0.02 cap; website and phone coverage still require qualification. |
| Outbound call | StablePhone AI Call | $0.54/call | Healthy, 4.6/5 and 93% reported success; US number schema and explicit DNC behavior. |
| Follow-up email | StableEmail Send | $0.02/call | Healthy, 5.0/5 and 92% reported success; supports plain text, HTML, reply-to, and attachments. |
| Revision inbox | AgentMail | $2 inbox, $0.01 reply | Inbox creation was healthy; thread and reply capabilities are available but must be inspected again before use. |
| Quote document | SendQuoteNow | $0.01/call | Schema is useful, but health was unknown; keep the internal quote path as default. |
| Preview hosting | ZeroClick Host Website | free listing, about $0.01 observed | Healthy with expiring URLs; appropriate only for preview delivery. |
| Site generation | Webber Sites multi-page builder | $0.05/call | Complete schema, but health was unknown; platform build agent remains primary. |
| Screenshot QA | 2s.io Screenshot API | $0.0075/call | Healthy and supports explicit viewport/render settings. |
| SEO QA | minifetch SEO Page Audit | $0.01/call | Healthy with deterministic technical findings. |
| URL safety | netintel.dev URL Safety Full Check | $0.15/call | Healthy; covers redirects, malware indicators, TLS, and response headers. |
| Header QA | 2s HTTP Security Headers Analyzer | $0.0018/call | Healthy with a structured header-grade response. |

## Runtime safeguards

- Search again before each live run; capability rankings, prices, and health can change.
- Inspect the selected capability and require a non-null request schema.
- Require `ZERO_LIVE_ACTIONS=true` for any paid operation.
- Apply the lower of the campaign spend allowance and the intent policy cap.
- Use `execFile`, never a shell, and require the fetched URL and method to match
  the freshly inspected capability.
- Keep customer text as untrusted data. It may populate provider fields but may
  not change the provider, spend cap, deployment target, or tool permissions.
- Record the Zero run ID, provider, price, result, and review in the BuildStax
  audit trail. Do not retry DNC, authentication, payment, or malformed-schema
  failures.
