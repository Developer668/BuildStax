import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "operator", "viewer"] }).notNull().default("operator"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    vertical: text("vertical").notNull(),
    region: text("region").notNull(),
    status: text("status", { enum: ["draft", "active", "paused", "archived"] }).notNull().default("draft"),
    dailyLeadLimit: integer("daily_lead_limit").notNull().default(20),
    dailySpendCapCents: integer("daily_spend_cap_cents").notNull().default(2500),
    pricingFloorCents: integer("pricing_floor_cents").notNull().default(150000),
    pitchScript: text("pitch_script").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("campaigns_status_idx").on(table.status)],
);

export const pitchVersions = sqliteTable(
  "pitch_versions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    script: text("script").notNull(),
    status: text("status", { enum: ["active", "challenger", "retired"] }).notNull(),
    calls: integer("calls").notNull().default(0),
    positiveOutcomes: integer("positive_outcomes").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("pitch_versions_campaign_idx").on(table.campaignId)],
);

export const businesses = sqliteTable(
  "businesses",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    location: text("location").notNull(),
    address: text("address").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    websiteStatus: text("website_status", { enum: ["none", "stale", "active", "unknown"] })
      .notNull()
      .default("unknown"),
    source: text("source").notNull(),
    sourceRef: text("source_ref").notNull().default(""),
    stage: text("stage").notNull().default("discovered"),
    score: integer("score").notNull().default(50),
    doNotCall: integer("do_not_call", { mode: "boolean" }).notNull().default(false),
    estimatedSiteCostCents: integer("estimated_site_cost_cents").notNull().default(90000),
    requirements: text("requirements").notNull().default(""),
    preferredStyle: text("preferred_style").notNull().default(""),
    nextAction: text("next_action").notNull().default("Review prospect"),
    nextActionAt: text("next_action_at"),
    lastContactAt: text("last_contact_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("businesses_stage_idx").on(table.stage),
    index("businesses_campaign_idx").on(table.campaignId),
    index("businesses_next_action_idx").on(table.nextActionAt),
  ],
);

export const calls = sqliteTable(
  "calls",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    outcome: text("outcome").notNull(),
    summary: text("summary").notNull(),
    transcript: text("transcript").notNull().default(""),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    provider: text("provider").notNull(),
    mode: text("mode", { enum: ["sandbox", "live", "manual"] }).notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("calls_business_idx").on(table.businessId)],
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    estimatedCostCents: integer("estimated_cost_cents").notNull(),
    configuredFloorCents: integer("configured_floor_cents").notNull(),
    multiplierFloorCents: integer("multiplier_floor_cents").notNull(),
    enforcedFloorCents: integer("enforced_floor_cents").notNull(),
    proposedPriceCents: integer("proposed_price_cents").notNull(),
    scope: text("scope").notNull(),
    status: text("status", { enum: ["draft", "sent", "accepted", "expired", "declined"] }).notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("quotes_business_idx").on(table.businessId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["pending", "paid", "refunded", "failed"] }).notNull(),
    provider: text("provider").notNull(),
    reference: text("reference").notNull(),
    paidAt: text("paid_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("payments_business_idx").on(table.businessId),
    uniqueIndex("payments_quote_unique").on(table.quoteId),
    uniqueIndex("payments_reference_unique").on(table.reference),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "building", "review", "delivered", "complete"] }).notNull(),
    brief: text("brief").notNull(),
    previewToken: text("preview_token").notNull(),
    productionUrl: text("production_url"),
    revisionCount: integer("revision_count").notNull().default(0),
    deliveredAt: text("delivered_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("projects_business_unique").on(table.businessId),
    uniqueIndex("projects_preview_token_unique").on(table.previewToken),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["inbound", "outbound", "internal"] }).notNull(),
    channel: text("channel", { enum: ["email", "preview", "note"] }).notNull(),
    status: text("status").notNull(),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    provider: text("provider").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("messages_business_idx").on(table.businessId)],
);

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "blocked"] }).notNull(),
    provider: text("provider").notNull(),
    mode: text("mode", { enum: ["sandbox", "live", "manual"] }).notNull(),
    summary: text("summary").notNull(),
    spendCents: integer("spend_cents").notNull().default(0),
    error: text("error").notNull().default(""),
    metadata: text("metadata").notNull().default("{}"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [index("automation_runs_started_idx").on(table.startedAt)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("audit_events_created_idx").on(table.createdAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
});

export type User = typeof users.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
