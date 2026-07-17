import type {
  AuditEvent,
  AutomationRun,
  Business,
  Call,
  Campaign,
  Message,
  Payment,
  Project,
  Quote,
} from "@/lib/db/schema";

export type InsForgeRow = Record<string, unknown>;

const text = (row: InsForgeRow, key: string, fallback = "") => String(row[key] ?? fallback);
const nullableText = (row: InsForgeRow, key: string) => (row[key] == null ? null : String(row[key]));
const number = (row: InsForgeRow, key: string, fallback = 0) => Number(row[key] ?? fallback);
const boolean = (row: InsForgeRow, key: string, fallback = false) => Boolean(row[key] ?? fallback);

export function mapCampaign(row: InsForgeRow): Campaign {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    vertical: text(row, "vertical"),
    region: text(row, "region"),
    status: text(row, "status", "draft") as Campaign["status"],
    dailyLeadLimit: number(row, "daily_lead_limit", 20),
    dailySpendCapCents: number(row, "daily_spend_cap_cents", 2500),
    pricingFloorCents: number(row, "pricing_floor_cents", 150000),
    pitchScript: text(row, "pitch_script"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export function mapBusiness(row: InsForgeRow): Business {
  return {
    id: text(row, "id"),
    campaignId: nullableText(row, "campaign_id"),
    name: text(row, "name"),
    category: text(row, "category"),
    location: text(row, "location"),
    address: text(row, "address"),
    contactName: text(row, "contact_name"),
    phone: text(row, "phone"),
    email: text(row, "email"),
    websiteStatus: text(row, "website_status", "unknown") as Business["websiteStatus"],
    source: text(row, "source"),
    sourceRef: text(row, "source_ref"),
    stage: text(row, "stage", "discovered"),
    score: number(row, "score", 50),
    doNotCall: boolean(row, "do_not_call"),
    estimatedSiteCostCents: number(row, "estimated_site_cost_cents", 90000),
    requirements: text(row, "requirements"),
    preferredStyle: text(row, "preferred_style"),
    nextAction: text(row, "next_action", "Review prospect"),
    nextActionAt: nullableText(row, "next_action_at"),
    lastContactAt: nullableText(row, "last_contact_at"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export function mapCall(row: InsForgeRow): Call {
  return {
    id: text(row, "id"), businessId: text(row, "business_id"), status: text(row, "status"),
    outcome: text(row, "outcome"), summary: text(row, "summary"), transcript: text(row, "transcript"),
    durationSeconds: number(row, "duration_seconds"), provider: text(row, "provider"),
    mode: text(row, "mode") as Call["mode"], costCents: number(row, "cost_cents"), createdAt: text(row, "created_at"),
  };
}

export function mapQuote(row: InsForgeRow): Quote {
  return {
    id: text(row, "id"), businessId: text(row, "business_id"), estimatedCostCents: number(row, "estimated_cost_cents"),
    configuredFloorCents: number(row, "configured_floor_cents"), multiplierFloorCents: number(row, "multiplier_floor_cents"),
    enforcedFloorCents: number(row, "enforced_floor_cents"), proposedPriceCents: number(row, "proposed_price_cents"),
    scope: text(row, "scope"), status: text(row, "status") as Quote["status"], expiresAt: text(row, "expires_at"), createdAt: text(row, "created_at"),
  };
}

export function mapPayment(row: InsForgeRow): Payment {
  return {
    id: text(row, "id"), businessId: text(row, "business_id"), quoteId: text(row, "quote_id"),
    amountCents: number(row, "amount_cents"), status: text(row, "status") as Payment["status"], provider: text(row, "provider"),
    reference: text(row, "reference"), paidAt: nullableText(row, "paid_at"), createdAt: text(row, "created_at"),
  };
}

export function mapProject(row: InsForgeRow): Project {
  return {
    id: text(row, "id"), businessId: text(row, "business_id"), status: text(row, "status") as Project["status"],
    brief: text(row, "brief"), previewToken: text(row, "preview_token"), productionUrl: nullableText(row, "production_url"),
    revisionCount: number(row, "revision_count"), deliveredAt: nullableText(row, "delivered_at"),
    createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
  };
}

export function mapMessage(row: InsForgeRow): Message {
  return {
    id: text(row, "id"), businessId: text(row, "business_id"), direction: text(row, "direction") as Message["direction"],
    channel: text(row, "channel") as Message["channel"], status: text(row, "status"), subject: text(row, "subject"),
    body: text(row, "body"), provider: text(row, "provider"), createdAt: text(row, "created_at"),
  };
}

export function mapAutomationRun(row: InsForgeRow): AutomationRun {
  const metadata = typeof row.metadata === "string" ? row.metadata : JSON.stringify(row.metadata ?? {});
  return {
    id: text(row, "id"), type: text(row, "type"), status: text(row, "status") as AutomationRun["status"],
    provider: text(row, "provider"), mode: text(row, "mode") as AutomationRun["mode"], summary: text(row, "summary"),
    spendCents: number(row, "spend_cents"), error: text(row, "error"), metadata,
    startedAt: text(row, "started_at"), finishedAt: nullableText(row, "finished_at"),
  };
}

export function mapAuditEvent(row: InsForgeRow): AuditEvent {
  return {
    id: text(row, "id"), actorId: text(row, "actor_id"), action: text(row, "action"), entityType: text(row, "entity_type"),
    entityId: text(row, "entity_id"), detail: text(row, "detail"), createdAt: text(row, "created_at"),
  };
}

export function mapPitchVersion(row: InsForgeRow) {
  return {
    id: text(row, "id"), campaignId: text(row, "campaign_id"), label: text(row, "label"), script: text(row, "script"),
    status: text(row, "status"), calls: number(row, "calls"), positiveOutcomes: number(row, "positive_outcomes"), createdAt: text(row, "created_at"),
  };
}
