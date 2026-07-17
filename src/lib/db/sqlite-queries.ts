import "server-only";

import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  auditEvents,
  automationRuns,
  businesses,
  calls,
  campaigns,
  messages,
  payments,
  pitchVersions,
  projects,
  quotes,
  settings,
  users,
} from "./schema";
import { activePipelineStages, type BusinessStage } from "@/lib/domain";

export async function getUserByEmail(email: string) {
  return getDb().select().from(users).where(eq(users.email, email.toLowerCase())).get() ?? null;
}

export async function getUserById(id: string) {
  return getDb().select().from(users).where(eq(users.id, id)).get() ?? null;
}

export async function getWorkspaceSettings() {
  const rows = getDb().select().from(settings).all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getDashboardData() {
  const db = getDb();
  const [businessRows, quoteRows, paymentRows, recentActivity, recentRuns] = await Promise.all([
    db.select().from(businesses).orderBy(desc(businesses.updatedAt)).all(),
    db.select().from(quotes).orderBy(desc(quotes.createdAt)).all(),
    db.select().from(payments).where(eq(payments.status, "paid")).all(),
    db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(8).all(),
    db.select().from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(5).all(),
  ]);

  const activeBusinesses = businessRows.filter((business) => activePipelineStages.includes(business.stage as BusinessStage));
  const pipelineValueCents = quoteRows
    .filter((quote) => ["sent", "accepted"].includes(quote.status))
    .reduce((sum, quote) => sum + quote.proposedPriceCents, 0);
  const collectedCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  const contacted = businessRows.filter((business) => business.lastContactAt).length;
  const positive = businessRows.filter((business) =>
    ["interested", "quoted", "payment_pending", "paid", "building", "review", "delivered", "won"].includes(business.stage),
  ).length;

  return {
    businesses: businessRows,
    activeBusinesses,
    pipelineValueCents,
    collectedCents,
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
    recentActivity,
    recentRuns,
  };
}

export async function listBusinesses(filters?: { search?: string; stage?: string; campaignId?: string }) {
  const clauses = [];
  if (filters?.search) {
    const pattern = `%${filters.search.replaceAll("%", "")}%;`;
    const safePattern = pattern.slice(0, -1);
    clauses.push(
      or(
        like(businesses.name, safePattern),
        like(businesses.category, safePattern),
        like(businesses.location, safePattern),
        like(businesses.contactName, safePattern),
      ),
    );
  }
  if (filters?.stage && filters.stage !== "all") clauses.push(eq(businesses.stage, filters.stage));
  if (filters?.campaignId && filters.campaignId !== "all") clauses.push(eq(businesses.campaignId, filters.campaignId));

  return getDb()
    .select({ business: businesses, campaignName: campaigns.name })
    .from(businesses)
    .leftJoin(campaigns, eq(businesses.campaignId, campaigns.id))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(businesses.score), asc(businesses.nextActionAt))
    .all();
}

export async function getBusinessDetail(id: string) {
  const db = getDb();
  const row = db
    .select({ business: businesses, campaign: campaigns })
    .from(businesses)
    .leftJoin(campaigns, eq(businesses.campaignId, campaigns.id))
    .where(eq(businesses.id, id))
    .get();
  if (!row) return null;
  const [businessCalls, businessQuotes, businessPayments, businessProjects, businessMessages, businessAudit] =
    await Promise.all([
      db.select().from(calls).where(eq(calls.businessId, id)).orderBy(desc(calls.createdAt)).all(),
      db.select().from(quotes).where(eq(quotes.businessId, id)).orderBy(desc(quotes.createdAt)).all(),
      db.select().from(payments).where(eq(payments.businessId, id)).orderBy(desc(payments.createdAt)).all(),
      db.select().from(projects).where(eq(projects.businessId, id)).orderBy(desc(projects.createdAt)).all(),
      db.select().from(messages).where(eq(messages.businessId, id)).orderBy(desc(messages.createdAt)).all(),
      db.select().from(auditEvents).where(eq(auditEvents.entityId, id)).orderBy(desc(auditEvents.createdAt)).limit(20).all(),
    ]);
  return {
    ...row,
    calls: businessCalls,
    quotes: businessQuotes,
    payments: businessPayments,
    project: businessProjects[0] ?? null,
    messages: businessMessages,
    audit: businessAudit,
  };
}

export async function listCampaigns() {
  const db = getDb();
  const rows = db.select().from(campaigns).orderBy(desc(campaigns.updatedAt)).all();
  return Promise.all(
    rows.map(async (campaign) => {
      const campaignBusinesses = db.select().from(businesses).where(eq(businesses.campaignId, campaign.id)).all();
      const versions = db.select().from(pitchVersions).where(eq(pitchVersions.campaignId, campaign.id)).orderBy(desc(pitchVersions.createdAt)).all();
      return {
        campaign,
        versions,
        leadCount: campaignBusinesses.length,
        activeCount: campaignBusinesses.filter((business) => activePipelineStages.includes(business.stage as BusinessStage)).length,
        wonCount: campaignBusinesses.filter((business) => business.stage === "won").length,
      };
    }),
  );
}

export async function listCampaignOptions() {
  return getDb().select({ id: campaigns.id, name: campaigns.name, pricingFloorCents: campaigns.pricingFloorCents }).from(campaigns).orderBy(asc(campaigns.name)).all();
}

export async function listAutomationRuns(filters?: { status?: string; type?: string }) {
  const clauses = [];
  if (filters?.status && filters.status !== "all") clauses.push(eq(automationRuns.status, filters.status as "queued"));
  if (filters?.type && filters.type !== "all") clauses.push(eq(automationRuns.type, filters.type));
  return getDb()
    .select()
    .from(automationRuns)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(automationRuns.startedAt))
    .all();
}

export async function listDeliveryProjects() {
  return getDb()
    .select({ project: projects, business: businesses })
    .from(projects)
    .innerJoin(businesses, eq(projects.businessId, businesses.id))
    .orderBy(desc(projects.updatedAt))
    .all();
}

export async function getPreviewByToken(token: string) {
  const row = getDb()
    .select({ project: projects, business: businesses })
    .from(projects)
    .innerJoin(businesses, eq(projects.businessId, businesses.id))
    .where(eq(projects.previewToken, token))
    .get();
  return row ?? null;
}

export async function getDatabaseHealth() {
  const result = getDb().get<{ ok: number }>(sql`select 1 as ok`);
  return result?.ok === 1;
}
