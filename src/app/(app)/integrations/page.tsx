import { CheckCircle2, CircleDashed, ExternalLink, PlugZap, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IntegrationAuditButton } from "@/components/integrations/integration-audit-button";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { isInsForgeBackend } from "@/lib/backend";
import { getDatabaseHealth } from "@/lib/db/queries";
import { getExternalIntegrationReadiness } from "@/lib/integrations/readiness";
import { capabilityPolicies } from "@/lib/providers/catalog";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const [readiness, databaseHealthy] = await Promise.all([getExternalIntegrationReadiness(), getDatabaseHealth()]);
  const primaryDatabase = isInsForgeBackend();
  const integrations = [
    { name: "InsForge", role: "Primary database, authentication, RLS, and workflow RPCs", status: primaryDatabase && databaseHealthy ? "ready" : databaseHealthy ? "partial" : "missing", detail: primaryDatabase && databaseHealthy ? "The active backend passed its public health RPC; tenant data remains protected by InsForge auth and row-level policies." : "InsForge is not the active data backend for this process.", vars: ["DATA_BACKEND", "NEXT_PUBLIC_INSFORGE_URL", "NEXT_PUBLIC_INSFORGE_ANON_KEY"] },
    { name: "Zero", role: "Capability discovery, provider selection, paid execution", status: readiness.zero.status, detail: readiness.zero.detail, vars: ["ZERO_RUNNER", "ZERO_LIVE_ACTIONS"] },
    { name: "Nexla", role: "Curated event ingestion and persistent agent context", status: readiness.nexla.status, detail: readiness.nexla.detail, vars: ["NEXLA_API_URL", "NEXLA_TOKEN", "NEXLA_INGEST_URL"] },
    { name: "OpenAI Realtime", role: "Natural voice conversation model", status: process.env.OPENAI_API_KEY ? "partial" : "missing", detail: process.env.OPENAI_API_KEY ? "A credential is detected but no realtime session or telephony bridge has been verified." : "No credential detected; manual call records remain available.", vars: ["OPENAI_API_KEY"] },
    { name: "Plivo Voice", role: "Signed PSTN transport and bidirectional PCMU audio streaming", status: readiness.plivo.status, detail: readiness.plivo.detail, vars: ["PLIVO_AUTH_ID", "PLIVO_PRIMARY_NUMBER", "PLIVO_PUBLIC_BASE_URL", "PLIVO_LIVE_CALLS_ENABLED"] },
    { name: "AkashML", role: "Live catalog and supervised structured pitch generation", status: readiness.akashml.status, detail: readiness.akashml.detail, vars: ["AKASHML_API_KEY", "AKASHML_MODEL"] },
    { name: "Stripe test", role: "Hosted customer checkout and verified InsForge webhook fulfillment", status: readiness.stripe.status, detail: readiness.stripe.detail, vars: ["STRIPE_SECRET_KEY", "STRIPE_PRODUCT_ID", "STRIPE_WEBHOOK_ENDPOINT_ID"] },
    { name: "Pomerium Zero", role: "Identity-aware access proxy and centrally managed policy plane", status: readiness.pomerium.status, detail: readiness.pomerium.detail, vars: ["POMERIUM_CLUSTER_TOKEN", "POMERIUM_ZERO_API_TOKEN", "POMERIUM_ZERO_ROUTE_ID", "POMERIUM_ZERO_POLICY_ID"] },
    { name: "SQLite sandbox", role: "Explicit offline development fallback", status: primaryDatabase ? "partial" : databaseHealthy ? "ready" : "missing", detail: primaryDatabase ? "Available only when DATA_BACKEND=sqlite; it is not the current system of record." : databaseHealthy ? "The local fallback database passed its health check." : "The local fallback database could not be read.", vars: ["DATABASE_URL"] },
  ] as const;

  return (
    <>
      <PageHeader eyebrow="System boundaries" title="Integrations" description="Credential presence is not presented as connectivity. Live readiness requires a verified provider path." icon={PlugZap} action={<IntegrationAuditButton />} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => <section key={integration.name} className="panel flex min-h-52 flex-col p-4"><div className="flex items-start justify-between gap-3"><div className="grid size-9 place-items-center rounded-[5px] bg-surface-subtle">{integration.status === "ready" ? <CheckCircle2 className="size-4 text-success" /> : integration.status === "partial" ? <TriangleAlert className="size-4 text-warning" /> : <CircleDashed className="size-4 text-muted-foreground" />}</div><Badge tone={integration.status === "ready" ? "success" : integration.status === "partial" ? "warning" : "neutral"}>{integration.status === "ready" ? "ready" : integration.status === "partial" ? "not verified" : "not configured"}</Badge></div><h2 className="mt-4 text-[13px] font-extrabold">{integration.name}</h2><p className="mt-1 text-[10px] font-semibold text-[#4c554d]">{integration.role}</p><p className="mt-3 text-[10px] leading-4 text-muted-foreground">{integration.detail}</p><div className="mono mt-auto pt-4 text-[9px] leading-4 text-[#7d857d]">{integration.vars.join(" · ")}</div></section>)}
      </div>

      <section className="panel mt-4 overflow-hidden">
        <div className="panel-header"><div><h2 className="section-title">Zero intent policies</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Every live run searches again, inspects the schema, applies its cap, and records a review.</p></div><ShieldCheck className="size-4 text-success" /></div>
        <div className="overflow-x-auto"><table className="data-table min-w-[820px]"><thead><tr><th>Intent</th><th>Preferred candidates</th><th>Per-call cap</th><th>Release condition</th></tr></thead><tbody>{Object.values(capabilityPolicies).map((policy) => <tr key={policy.intent}><td><div className="text-[11px] font-bold">{policy.label}</div><div className="mono mt-0.5 text-[9px] text-muted-foreground">{policy.intent}</div></td><td className="max-w-72 text-[10px]">{policy.preferredCanonicalNames.join(" · ")}</td><td className="mono text-[10px]">${policy.maxPayUsd.toFixed(4)}</td><td className="max-w-sm text-[10px] leading-4 text-muted-foreground">{policy.notes}</td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-4 flex flex-col gap-3 rounded-[10px] border border-[#d4d8f2] bg-[#f3f4fb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[11px] font-bold text-[#3f4d9e]">Provider research record</div><p className="mt-0.5 text-[10px] text-[#687099]">Current candidates, prices, evidence limits, and spend policies are tracked in the repository.</p></div><Link href="https://www.zero.xyz" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#5266ed] hover:underline">Zero marketplace <ExternalLink className="size-3" /></Link></section>
    </>
  );
}
