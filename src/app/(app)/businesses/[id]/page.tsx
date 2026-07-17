import { AlertTriangle, ArrowLeft, CalendarClock, Globe2, Mail, MapPin, Phone, ReceiptText, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LogCallDialog,
  MessageDialog,
  PaymentDialog,
  ProjectAction,
  QuoteDialog,
  RequirementsDialog,
  PlivoCallDialog,
  StageControl,
  StartBuildButton,
  StripeCheckoutButton,
} from "@/components/business/business-actions";
import { BusinessTabs } from "@/components/business/business-tabs";
import { BusinessAvatar } from "@/components/domain/business-avatar";
import { StageBadge } from "@/components/domain/status-badges";
import { Badge } from "@/components/ui/badge";
import { getBusinessDetail, getWorkspaceSettings } from "@/lib/db/queries";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { isStripeCheckoutConfigured } from "@/lib/integrations/stripe";
import { isPlivoCallConfigured } from "@/lib/integrations/plivo";
import { isSandbox } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getBusinessDetail(id);
  return { title: detail?.business.name ?? "Business" };
}

export default async function BusinessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment } = await searchParams;
  const [detail, workspace] = await Promise.all([getBusinessDetail(id), getWorkspaceSettings()]);
  if (!detail) notFound();
  const { business, campaign, calls, quotes, payments, project, messages } = detail;
  const renderTimestamp = Date.now(); // eslint-disable-line react-hooks/purity -- request-scoped server snapshot
  const openQuote = quotes.find((quote) => ["sent", "accepted"].includes(quote.status) && new Date(quote.expiresAt).getTime() > renderTimestamp);
  const configuredFloorCents = campaign?.pricingFloorCents ?? Number(workspace.default_pricing_floor_cents ?? 150000);
  const canQuote = ["interested", "quoted"].includes(business.stage);
  const canPay = ["quoted", "payment_pending"].includes(business.stage) && openQuote;
  const stripeConfigured = isStripeCheckoutConfigured();
  const plivoConfigured = isPlivoCallConfigured();
  const canBuild = business.stage === "paid" && !project;

  return (
    <>
      <Link href="/pipeline" className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Pipeline</Link>
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <BusinessAvatar name={business.name} className="size-12 text-[13px]" />
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-extrabold leading-tight sm:text-[26px]">{business.name}</h1><StageBadge stage={business.stage} />{business.doNotCall ? <Badge tone="danger">DNC</Badge> : null}</div><p className="mt-1 text-[11px] text-muted-foreground">{business.category} · {business.location} · Score <span className="mono font-semibold text-foreground">{business.score}</span></p><p className="mt-1 text-[10px] text-[#889088]">{campaign?.name ?? "No campaign"} · Source: {business.source === "sandbox" ? "sandbox fixture" : business.source}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StageControl business={business} />
          {plivoConfigured ? <PlivoCallDialog business={business} mode={isSandbox() ? "sandbox" : "live"} /> : null}
          <LogCallDialog business={business} />
          <MessageDialog business={business} />
          <RequirementsDialog business={business} />
          {canQuote ? <QuoteDialog business={business} configuredFloorCents={configuredFloorCents} /> : null}
          {canPay && openQuote && stripeConfigured ? <StripeCheckoutButton business={business} quote={openQuote} /> : null}
          {canPay && openQuote && !stripeConfigured ? <PaymentDialog business={business} quote={openQuote} /> : null}
          {canBuild ? <StartBuildButton business={business} /> : null}
          {project ? <ProjectAction business={business} project={project} /> : null}
        </div>
      </header>

      {payment === "processing" ? <div role="status" className="mb-4 rounded-[6px] border border-[#b9dfc9] bg-[#effaf3] px-4 py-3 text-[10px] leading-4 text-[#286342]"><strong className="block text-[11px]">Payment received by Stripe</strong>InsForge is verifying the signed webhook. This record will unlock automatically when the amount and quote metadata match.</div> : null}
      {payment === "cancelled" ? <div role="status" className="mb-4 rounded-[6px] border border-[#ead5a8] bg-[#fff9ea] px-4 py-3 text-[10px] leading-4 text-[#76571d]"><strong className="block text-[11px]">Checkout cancelled</strong>No payment was recorded. The quote remains open.</div> : null}

      {business.doNotCall ? <div role="alert" className="mb-4 flex items-start gap-3 rounded-[6px] border border-[#efc4bd] bg-[#fff1ef] px-4 py-3 text-[#8f392f]"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><div><div className="text-[11px] font-bold">Outreach blocked</div><div className="mt-0.5 text-[10px]">This record cannot initiate calls or outbound messages. The permanent block is enforced by the database.</div></div></div> : null}

      <section aria-label="Business summary" className="mb-4 grid gap-px overflow-hidden rounded-[6px] border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCell icon={CalendarClock} label="Next action" value={business.nextAction} detail={business.nextActionAt ? formatRelativeTime(business.nextActionAt) : "No due date"} />
        <SummaryCell icon={Phone} label="Last contact" value={business.lastContactAt ? formatDate(business.lastContactAt) : "Not contacted"} detail={`${calls.length} recorded call${calls.length === 1 ? "" : "s"}`} />
        <SummaryCell icon={ReceiptText} label="Commercial" value={openQuote ? formatCurrency(openQuote.proposedPriceCents) : "No open quote"} detail={payments.some((item) => item.status === "paid") ? `${formatCurrency(payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amountCents, 0))} collected` : `Floor ${formatCurrency(configuredFloorCents)}`} />
        <SummaryCell icon={Globe2} label="Delivery" value={project ? project.status : "Not started"} detail={project ? `${project.revisionCount} revision${project.revisionCount === 1 ? "" : "s"}` : "Payment and requirements required"} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <BusinessTabs calls={calls} messages={messages} quotes={quotes} payments={payments} project={project} />
        <aside className="space-y-4">
          <section className="panel">
            <div className="panel-header"><h2 className="section-title">Contact</h2>{business.contactName ? <Badge tone="neutral">Known</Badge> : <Badge tone="warning">Incomplete</Badge>}</div>
            <dl className="divide-y divide-border">
              <ContactRow icon={UserRound} label="Contact" value={business.contactName || "Not identified"} />
              <ContactRow icon={Phone} label="Phone" value={business.phone} href={`tel:${business.phone.replace(/[^+\d]/g, "")}`} />
              <ContactRow icon={Mail} label="Email" value={business.email || "Not collected"} href={business.email ? `mailto:${business.email}` : undefined} />
              <ContactRow icon={MapPin} label="Address" value={business.address || business.location} />
              <ContactRow icon={Globe2} label="Website" value={business.websiteStatus === "none" ? "No first-party site" : business.websiteStatus} />
            </dl>
          </section>

          <section className="panel p-4">
            <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /><h2 className="section-title">Approved requirements</h2></div>
            {business.requirements ? <p className="mt-3 whitespace-pre-wrap text-[10px] leading-5 text-[#485049]">{business.requirements}</p> : <p className="mt-3 text-[10px] leading-5 text-muted-foreground">No approved requirements yet. Capture them before quoting or starting a build.</p>}
            {business.preferredStyle ? <><div className="eyebrow mt-4">Visual direction</div><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{business.preferredStyle}</p></> : null}
          </section>

          <section className="panel p-4">
            <div className="eyebrow">Pricing guardrail</div><div className="mono mt-2 text-[20px] font-semibold">{formatCurrency(Math.max(business.estimatedSiteCostCents * 2, configuredFloorCents))}</div><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Current enforced minimum: higher of 2 × {formatCurrency(business.estimatedSiteCostCents)} cost or {formatCurrency(configuredFloorCents)} configured floor.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

function SummaryCell({ icon: Icon, label, value, detail }: { icon: typeof Phone; label: string; value: string; detail: string }) {
  return <div className="flex min-h-24 items-start gap-3 bg-white p-4"><div className="grid size-8 shrink-0 place-items-center rounded-[5px] bg-surface-subtle text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0"><div className="eyebrow">{label}</div><div className="mt-1 truncate text-[11px] font-bold">{value}</div><div className="mono mt-1 text-[9px] text-muted-foreground">{detail}</div></div></div>;
}

function ContactRow({ icon: Icon, label, value, href }: { icon: typeof Phone; label: string; value: string; href?: string }) {
  const content = <><Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span><span className="block text-[9px] font-bold uppercase text-muted-foreground">{label}</span><span className="mt-0.5 block break-words text-[10px] font-semibold">{value}</span></span></>;
  return href ? <a href={href} className="flex gap-3 px-4 py-3 hover:bg-[#fafbfa]">{content}</a> : <div className="flex gap-3 px-4 py-3">{content}</div>;
}
