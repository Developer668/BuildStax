import "server-only";

import { activePipelineStages, type BusinessStage } from "@/lib/domain";
import type { Business, Campaign, Project } from "@/lib/db/schema";
import { createInsForgePublicClient } from "./client";
import { requireInsForgeContext } from "./context";
import {
  mapAuditEvent,
  mapAutomationRun,
  mapBusiness,
  mapCall,
  mapCampaign,
  mapMessage,
  mapPayment,
  mapPitchVersion,
  mapProject,
  mapQuote,
  type InsForgeRow,
} from "./map";

function expectRows(result: { data: unknown; error: unknown }, label: string) {
  if (result.error) throw new Error(`InsForge could not load ${label}.`);
  return (Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) as InsForgeRow[];
}

export async function getWorkspaceSettings() {
  const { client, workspaceId } = await requireInsForgeContext();
  const result = await client.database.from("workspaces").select().eq("id", workspaceId).maybeSingle();
  const row = expectRows(result, "workspace settings")[0];
  if (!row) throw new Error("BuildStax workspace not found.");
  return {
    workspace_name: String(row.name),
    default_pricing_floor_cents: String(row.default_pricing_floor_cents),
    currency: String(row.currency),
    timezone: String(row.timezone),
    require_call_before_email: String(Boolean(row.require_call_before_email)),
    block_dnc_outreach: String(Boolean(row.block_dnc_outreach)),
    require_payment_before_build: String(Boolean(row.require_payment_before_build)),
  };
}

export async function getDashboardData() {
  const { client, workspaceId } = await requireInsForgeContext();
  const [businessResult, quoteResult, paymentResult, auditResult, runResult] = await Promise.all([
    client.database.from("businesses").select().eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    client.database.from("quotes").select().eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.database.from("payments").select().eq("workspace_id", workspaceId).eq("status", "paid"),
    client.database.from("audit_events").select().eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(8),
    client.database.from("automation_runs").select().eq("workspace_id", workspaceId).order("started_at", { ascending: false }).limit(5),
  ]);
  const businessRows = expectRows(businessResult, "businesses").map(mapBusiness);
  const quoteRows = expectRows(quoteResult, "quotes").map(mapQuote);
  const paymentRows = expectRows(paymentResult, "payments").map(mapPayment);
  const activeBusinesses = businessRows.filter((business) => activePipelineStages.includes(business.stage as BusinessStage));
  const contacted = businessRows.filter((business) => business.lastContactAt).length;
  const positive = businessRows.filter((business) =>
    ["interested", "quoted", "payment_pending", "paid", "building", "review", "delivered", "won"].includes(business.stage),
  ).length;
  return {
    businesses: businessRows,
    activeBusinesses,
    pipelineValueCents: quoteRows.filter((quote) => ["sent", "accepted"].includes(quote.status)).reduce((sum, quote) => sum + quote.proposedPriceCents, 0),
    collectedCents: paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0),
    conversionRate: contacted ? Math.round((positive / contacted) * 100) : 0,
    dueToday: activeBusinesses.filter((business) => {
      if (!business.nextActionAt) return false;
      const date = new Date(business.nextActionAt);
      const today = new Date();
      return date.toDateString() === today.toDateString() || date < today;
    }),
    stageCounts: Object.fromEntries(
      activePipelineStages.map((stage) => [stage, businessRows.filter((business) => business.stage === stage).length]),
    ) as Record<BusinessStage, number>,
    recentActivity: expectRows(auditResult, "audit events").map(mapAuditEvent),
    recentRuns: expectRows(runResult, "automation runs").map(mapAutomationRun),
  };
}

export async function listBusinesses(filters?: { search?: string; stage?: string; campaignId?: string }) {
  const { client, workspaceId } = await requireInsForgeContext();
  let query = client.database.from("businesses").select().eq("workspace_id", workspaceId);
  if (filters?.stage && filters.stage !== "all") query = query.eq("stage", filters.stage);
  if (filters?.campaignId && filters.campaignId !== "all") query = query.eq("campaign_id", filters.campaignId);
  const [businessResult, campaignResult] = await Promise.all([
    query.order("score", { ascending: false }).order("next_action_at", { ascending: true }),
    client.database.from("campaigns").select("id, name").eq("workspace_id", workspaceId),
  ]);
  const campaigns = new Map(expectRows(campaignResult, "campaigns").map((row) => [String(row.id), String(row.name)]));
  const search = filters?.search?.trim().toLowerCase();
  return expectRows(businessResult, "businesses")
    .map(mapBusiness)
    .filter((business) => !search || [business.name, business.category, business.location, business.contactName].some((value) => value.toLowerCase().includes(search)))
    .map((business) => ({ business, campaignName: business.campaignId ? campaigns.get(business.campaignId) ?? null : null }));
}

export async function getBusinessDetail(id: string) {
  const { client, workspaceId } = await requireInsForgeContext();
  const businessResult = await client.database.from("businesses").select().eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  const businessRow = expectRows(businessResult, "business")[0];
  if (!businessRow) return null;
  const business = mapBusiness(businessRow);
  const [campaignResult, callsResult, quotesResult, paymentsResult, projectsResult, messagesResult, auditResult] = await Promise.all([
    business.campaignId
      ? client.database.from("campaigns").select().eq("workspace_id", workspaceId).eq("id", business.campaignId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.database.from("calls").select().eq("workspace_id", workspaceId).eq("business_id", id).order("created_at", { ascending: false }),
    client.database.from("quotes").select().eq("workspace_id", workspaceId).eq("business_id", id).order("created_at", { ascending: false }),
    client.database.from("payments").select().eq("workspace_id", workspaceId).eq("business_id", id).order("created_at", { ascending: false }),
    client.database.from("projects").select().eq("workspace_id", workspaceId).eq("business_id", id).order("created_at", { ascending: false }),
    client.database.from("messages").select().eq("workspace_id", workspaceId).eq("business_id", id).order("created_at", { ascending: false }),
    client.database.from("audit_events").select().eq("workspace_id", workspaceId).eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const projectRows = expectRows(projectsResult, "projects").map(mapProject);
  return {
    business,
    campaign: expectRows(campaignResult, "campaign")[0] ? mapCampaign(expectRows(campaignResult, "campaign")[0]) : null,
    calls: expectRows(callsResult, "calls").map(mapCall),
    quotes: expectRows(quotesResult, "quotes").map(mapQuote),
    payments: expectRows(paymentsResult, "payments").map(mapPayment),
    project: projectRows[0] ?? null,
    messages: expectRows(messagesResult, "messages").map(mapMessage),
    audit: expectRows(auditResult, "audit events").map(mapAuditEvent),
  };
}

export async function listCampaigns() {
  const { client, workspaceId } = await requireInsForgeContext();
  const [campaignResult, businessResult, pitchResult] = await Promise.all([
    client.database.from("campaigns").select().eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    client.database.from("businesses").select("id, campaign_id, stage").eq("workspace_id", workspaceId),
    client.database.from("pitch_versions").select().eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
  ]);
  const businesses = expectRows(businessResult, "campaign businesses");
  const versions = expectRows(pitchResult, "pitch versions").map(mapPitchVersion);
  return expectRows(campaignResult, "campaigns").map(mapCampaign).map((campaign) => {
    const campaignBusinesses = businesses.filter((business) => business.campaign_id === campaign.id);
    return {
      campaign,
      versions: versions.filter((version) => version.campaignId === campaign.id),
      leadCount: campaignBusinesses.length,
      activeCount: campaignBusinesses.filter((business) => activePipelineStages.includes(String(business.stage) as BusinessStage)).length,
      wonCount: campaignBusinesses.filter((business) => business.stage === "won").length,
    };
  });
}

export async function listCampaignOptions() {
  const { client, workspaceId } = await requireInsForgeContext();
  const result = await client.database.from("campaigns").select("id, name, pricing_floor_cents").eq("workspace_id", workspaceId).order("name", { ascending: true });
  return expectRows(result, "campaign options").map((row) => ({
    id: String(row.id), name: String(row.name), pricingFloorCents: Number(row.pricing_floor_cents),
  }));
}

export async function listAutomationRuns(filters?: { status?: string; type?: string }) {
  const { client, workspaceId } = await requireInsForgeContext();
  let query = client.database.from("automation_runs").select().eq("workspace_id", workspaceId);
  if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters?.type && filters.type !== "all") query = query.eq("type", filters.type);
  const result = await query.order("started_at", { ascending: false });
  return expectRows(result, "automation runs").map(mapAutomationRun);
}

export async function listDeliveryProjects() {
  const { client, workspaceId } = await requireInsForgeContext();
  const [projectResult, businessResult] = await Promise.all([
    client.database.from("projects").select().eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    client.database.from("businesses").select().eq("workspace_id", workspaceId),
  ]);
  const businesses = new Map(expectRows(businessResult, "project businesses").map((row) => {
    const business = mapBusiness(row);
    return [business.id, business];
  }));
  return expectRows(projectResult, "delivery projects")
    .map(mapProject)
    .flatMap((project) => {
      const business = businesses.get(project.businessId);
      return business ? [{ project, business }] : [];
    });
}

export async function getPreviewByToken(token: string) {
  const client = createInsForgePublicClient();
  const result = await client.database.rpc("get_buildstax_preview", { p_token: token });
  const row = expectRows(result, "customer preview")[0];
  if (!row) return null;
  const business = mapBusiness({
    id: row.business_id,
    name: row.business_name,
    category: row.category,
    location: row.location,
    phone: row.phone,
    preferred_style: row.preferred_style,
  });
  const project = mapProject({
    id: row.project_id,
    business_id: row.business_id,
    status: row.project_status,
    revision_count: row.revision_count,
    brief: row.project_brief,
  });
  return { business, project } as { business: Business; project: Project };
}

export async function getDatabaseHealth() {
  try {
    const client = createInsForgePublicClient();
    const { data, error } = await client.database.rpc("buildstax_health");
    return !error && (data === true || (Array.isArray(data) && data[0] === true));
  } catch {
    return false;
  }
}

export type { Campaign };
