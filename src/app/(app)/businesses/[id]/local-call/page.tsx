import { ArrowLeft, Info, Laptop, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DograhCallSurface } from "@/components/local-call/dograh-local-call";
import { getBusinessDetail, getWorkspaceSettings } from "@/lib/db/queries";
import { formatCurrency } from "@/lib/format";
import { dograhLocalCallConfig } from "@/lib/integrations/dograh";

export const dynamic = "force-dynamic";

const CALLABLE_STAGES = ["call_ready", "contacted", "interested", "quoted", "payment_pending"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getBusinessDetail(id);
  return { title: detail ? `Call locally · ${detail.business.name}` : "Local call" };
}

export default async function BusinessLocalCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = dograhLocalCallConfig();
  const [detail, workspace] = await Promise.all([getBusinessDetail(id), getWorkspaceSettings()]);
  if (!detail) notFound();

  const { business, campaign, quotes } = detail;
  const configuredFloorCents = campaign?.pricingFloorCents ?? Number(workspace.default_pricing_floor_cents ?? 150000);
  const enforcedFloorCents = Math.max(configuredFloorCents, business.estimatedSiteCostCents * 2);
  const renderTimestamp = Date.now(); // eslint-disable-line react-hooks/purity -- request-scoped server snapshot
  const openQuote = quotes.find((quote) => ["sent", "accepted"].includes(quote.status) && new Date(quote.expiresAt).getTime() > renderTimestamp);
  const offerCents = Math.max(enforcedFloorCents, openQuote?.proposedPriceCents ?? enforcedFloorCents);
  const blockedReason = business.doNotCall
    ? "Outreach is permanently blocked for this business."
    : !CALLABLE_STAGES.includes(business.stage)
      ? "This business is not in a callable pipeline stage yet."
      : "";

  return (
    <>
      <Link href={`/businesses/${business.id}`} className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {business.name}
      </Link>
      <header className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Laptop className="size-5 text-brand-blue" />
          <h1 className="text-[22px] font-extrabold leading-tight sm:text-[24px]">Call locally</h1>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A browser-based, self-hosted voice-agent call — a secondary option to the primary phone (Plivo) call. The agent runs the same sales conversation without dialing a phone.
        </p>
      </header>

      {!config.enabled ? (
        <div role="status" className="flex items-start gap-3 rounded-[6px] border border-[#c8d6ff] bg-[#f1f5ff] px-4 py-3 text-[#22489e]">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="text-[11px] font-bold">Local Dograh calling is turned off</div>
            <div className="mt-1 text-[10px] leading-4 text-[#4561a4]">
              Run your local Dograh stack, then set <span className="mono">DOGRAH_LOCAL_CALLS_ENABLED=true</span> and <span className="mono">DOGRAH_WIDGET_SCRIPT_URL</span> in <span className="mono">.env.local</span> (non-production only). See <span className="mono">docs/dograh-local-call.md</span> for the full setup.
            </div>
          </div>
        </div>
      ) : blockedReason ? (
        <div role="alert" className="flex items-start gap-3 rounded-[6px] border border-[#efc4bd] bg-[#fff1ef] px-4 py-3 text-[#8f392f]">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="text-[11px] font-bold">This call can&apos;t start</div>
            <div className="mt-1 text-[10px] leading-4">{blockedReason}</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <DograhCallSurface config={{ scriptUrl: config.scriptUrl, attrs: config.attrs, origin: config.origin }} />

          <aside className="space-y-4">
            <section className="panel p-4">
              <div className="eyebrow">Customer brief · your script</div>
              <h2 className="mt-1 text-[15px] font-extrabold leading-tight">{business.name}</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{business.category} · {business.location}</p>
              <dl className="mt-3 space-y-2 text-[10px] leading-4">
                <BriefRow label="Contact" value={business.contactName || "Not identified"} />
                <BriefRow label="Email" value={business.email || "Not collected"} />
                <BriefRow label="Phone" value={business.phone} />
                <BriefRow label="Website" value={business.websiteStatus === "none" ? "No first-party site" : business.websiteStatus} />
              </dl>
            </section>

            <section className="panel p-4">
              <div className="eyebrow">Requirements</div>
              {business.requirements
                ? <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-[#485049]">{business.requirements}</p>
                : <p className="mt-2 text-[10px] leading-5 text-muted-foreground">No approved requirements yet.</p>}
              {business.preferredStyle ? <><div className="eyebrow mt-3">Visual direction</div><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{business.preferredStyle}</p></> : null}
            </section>

            <section className="panel p-4">
              <div className="eyebrow">Floor-safe offer</div>
              <div className="mono mt-2 text-[20px] font-semibold">{formatCurrency(offerCents)}</div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Never quote below the enforced floor of <span className="mono font-semibold text-foreground">{formatCurrency(enforcedFloorCents)}</span> (higher of 2 × {formatCurrency(business.estimatedSiteCostCents)} cost or {formatCurrency(configuredFloorCents)} configured floor).
              </p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
    </div>
  );
}
