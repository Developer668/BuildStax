"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutationUser } from "@/lib/auth/session";
import { createBuildArtifact } from "@/lib/builds/artifact";
import { getDb } from "@/lib/db";
import { getWorkspaceSettings } from "@/lib/db/sqlite-queries";
import {
  automationRuns,
  businesses,
  calls,
  campaigns,
  messages,
  payments,
  projects,
  quotes,
} from "@/lib/db/schema";
import {
  businessStages,
  calculatePriceFloor,
  canManuallyTransitionStage,
  nextProjectStage,
  stageAfterCallOutcome,
  type BusinessStage,
} from "@/lib/domain";
import { deliverTransactionalEmail, safeEmailProviderMessage } from "@/lib/integrations/email";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSandbox } from "@/lib/utils";
import type { ActionState } from "./types";
import { actionError, actionSuccess, audit, dollarsToCents, id } from "./helpers";

const createBusinessSchema = z.object({
  name: z.string().trim().min(2, "Enter a business name.").max(120),
  category: z.string().trim().min(2, "Enter a category.").max(80),
  location: z.string().trim().min(2, "Enter a city or neighborhood.").max(120),
  address: z.string().trim().max(200).default(""),
  contactName: z.string().trim().max(100).default(""),
  phone: z.string().trim().min(7, "Enter a reachable phone number.").max(30),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]),
  websiteStatus: z.enum(["none", "stale", "active", "unknown"]),
  campaignId: z.string().trim().max(100).optional(),
});

export async function createBusinessAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = createBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const duplicate = db
    .select()
    .from(businesses)
    .where(
      and(
        sql`lower(${businesses.name}) = ${parsed.data.name.toLowerCase()}`,
        eq(businesses.phone, parsed.data.phone),
      ),
    )
    .get();
  if (duplicate) return actionError("That business and phone number are already in the pipeline.");
  if (parsed.data.campaignId) {
    const campaign = db.select().from(campaigns).where(eq(campaigns.id, parsed.data.campaignId)).get();
    if (!campaign) return actionError("The selected campaign no longer exists.");
  }
  const businessId = id("biz");
  const now = new Date().toISOString();
  db.insert(businesses)
    .values({
      id: businessId,
      campaignId: parsed.data.campaignId || null,
      name: parsed.data.name,
      category: parsed.data.category,
      location: parsed.data.location,
      address: parsed.data.address,
      contactName: parsed.data.contactName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      websiteStatus: parsed.data.websiteStatus,
      source: "manual",
      sourceRef: `Added by ${user.email}`,
      stage: "call_ready",
      score: 70,
      doNotCall: false,
      estimatedSiteCostCents: 90000,
      requirements: "",
      preferredStyle: "",
      nextAction: "Place first call",
      nextActionAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  audit({ actorId: user.id, action: "business.created", entityType: "business", entityId: businessId, detail: `Added ${parsed.data.name} to the call-ready queue.` });
  revalidatePath("/");
  revalidatePath("/pipeline");
  return actionSuccess("Business added.", `/businesses/${businessId}`);
}

const stageSchema = z.object({ businessId: z.string().min(1), stage: z.enum(businessStages) });

export async function updateBusinessStageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Select a valid pipeline stage.");
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business) return actionError("Business not found.");
  const current = business.stage as BusinessStage;
  if (!canManuallyTransitionStage(current, parsed.data.stage)) {
    return actionError("Use the call, quote, payment, or project control for evidence-backed stage changes.");
  }
  db.update(businesses)
    .set({
      stage: parsed.data.stage,
      doNotCall: parsed.data.stage === "dnc" ? true : business.doNotCall,
      nextAction: parsed.data.stage === "dnc" ? "No outreach permitted" : business.nextAction,
      nextActionAt: parsed.data.stage === "dnc" ? null : business.nextActionAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(businesses.id, business.id))
    .run();
  audit({ actorId: user.id, action: "business.stage_changed", entityType: "business", entityId: business.id, detail: `Moved ${business.name} from ${current} to ${parsed.data.stage}.` });
  revalidateBusiness(business.id);
  return actionSuccess("Pipeline stage updated.");
}

const callSchema = z.object({
  businessId: z.string().min(1),
  outcome: z.enum(["interested", "follow_up", "no_answer", "not_interested", "do_not_call"]),
  summary: z.string().trim().min(10, "Add a useful call summary.").max(2000),
  transcript: z.string().trim().max(12000).default(""),
  durationMinutes: z.coerce.number().min(0).max(120),
});

export async function logCallAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = callSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the call details.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business) return actionError("Business not found.");
  if (business.doNotCall) return actionError("This business is on the do-not-call list. No new call may be recorded as outreach.");
  if (!["call_ready", "contacted", "interested", "quoted", "payment_pending"].includes(business.stage)) {
    return actionError("Move this business to the call-ready queue before recording outreach.");
  }
  const now = new Date().toISOString();
  const stage = stageAfterCallOutcome(business.stage as BusinessStage, parsed.data.outcome);
  db.transaction((tx) => {
    tx.insert(calls)
      .values({
        id: id("call"),
        businessId: business.id,
        status: "completed",
        outcome: parsed.data.outcome,
        summary: parsed.data.summary,
        transcript: parsed.data.transcript,
        durationSeconds: Math.round(parsed.data.durationMinutes * 60),
        provider: "Manual record",
        mode: "manual",
        costCents: 0,
        createdAt: now,
      })
      .run();
    tx.update(businesses)
      .set({
        stage,
        doNotCall: parsed.data.outcome === "do_not_call",
        lastContactAt: now,
        nextAction: nextActionForCall(parsed.data.outcome),
        nextActionAt: ["not_interested", "do_not_call"].includes(parsed.data.outcome) ? null : addDays(1),
        updatedAt: now,
      })
      .where(eq(businesses.id, business.id))
      .run();
  });
  audit({ actorId: user.id, action: "call.logged", entityType: "business", entityId: business.id, detail: `Recorded a ${parsed.data.outcome.replaceAll("_", " ")} call outcome.` });
  revalidateBusiness(business.id);
  return actionSuccess("Call outcome recorded.");
}

const quoteSchema = z.object({
  businessId: z.string().min(1),
  estimatedCost: z.coerce.number().positive("Enter a positive delivery cost.").max(100000),
  proposedPrice: z.coerce.number().positive("Enter a positive customer price.").max(250000),
  scope: z.string().trim().min(20, "Describe the customer-facing scope.").max(4000),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
});

export async function createQuoteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = quoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the quote details.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business) return actionError("Business not found.");
  if (business.doNotCall) return actionError("A quote cannot be created for a do-not-call business.");
  if (!["interested", "quoted"].includes(business.stage)) {
    return actionError("Record an interested call outcome before creating a quote.");
  }
  const priorCall = db.select().from(calls).where(eq(calls.businessId, business.id)).get();
  if (!priorCall) return actionError("Record the first phone call before creating a quote.");
  const campaign = business.campaignId ? db.select().from(campaigns).where(eq(campaigns.id, business.campaignId)).get() : null;
  const workspace = await getWorkspaceSettings();
  const estimatedCostCents = dollarsToCents(parsed.data.estimatedCost);
  const configuredFloorCents = campaign?.pricingFloorCents ?? Number(workspace.default_pricing_floor_cents ?? 150000);
  const floor = calculatePriceFloor(estimatedCostCents, configuredFloorCents);
  const proposedPriceCents = dollarsToCents(parsed.data.proposedPrice);
  if (proposedPriceCents < floor.enforcedFloorCents) {
    return actionError(`Price cannot be lower than $${(floor.enforcedFloorCents / 100).toLocaleString("en-US")} (the higher of 2x cost or the configured floor).`, {
      proposedPrice: ["Raise the customer price to the enforced floor or above."],
    });
  }
  const existing = db
    .select()
    .from(quotes)
    .where(and(eq(quotes.businessId, business.id), eq(quotes.status, "sent")))
    .orderBy(desc(quotes.createdAt))
    .get();
  if (existing && existing.proposedPriceCents === proposedPriceCents && existing.scope === parsed.data.scope) {
    return actionSuccess("This quote is already recorded.");
  }
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(quotes).set({ status: "expired" }).where(and(eq(quotes.businessId, business.id), eq(quotes.status, "sent"))).run();
    tx.insert(quotes)
      .values({
        id: id("quo"),
        businessId: business.id,
        estimatedCostCents,
        configuredFloorCents,
        multiplierFloorCents: floor.multiplierFloorCents,
        enforcedFloorCents: floor.enforcedFloorCents,
        proposedPriceCents,
        scope: parsed.data.scope,
        status: "sent",
        expiresAt: addDays(parsed.data.expiresInDays),
        createdAt: now,
      })
      .run();
    tx.update(businesses)
      .set({
        stage: "quoted",
        estimatedSiteCostCents: estimatedCostCents,
        nextAction: "Follow up on quote",
        nextActionAt: addDays(2),
        updatedAt: now,
      })
      .where(eq(businesses.id, business.id))
      .run();
  });
  audit({ actorId: user.id, action: "quote.sent", entityType: "business", entityId: business.id, detail: `Recorded a $${parsed.data.proposedPrice.toLocaleString("en-US")} quote above the enforced floor.` });
  revalidateBusiness(business.id);
  return actionSuccess("Quote recorded and ready for follow-up.");
}

const paymentSchema = z.object({
  businessId: z.string().min(1),
  quoteId: z.string().min(1),
  amount: z.coerce.number().positive().max(250000),
  reference: z.string().trim().min(4, "Enter a payment reference.").max(100),
});

export async function recordPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the payment details.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business || !["quoted", "payment_pending"].includes(business.stage)) {
    return actionError("This business is not awaiting payment.");
  }
  const quote = db.select().from(quotes).where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.businessId, parsed.data.businessId))).get();
  if (!quote || !["sent", "accepted"].includes(quote.status)) return actionError("Select an open quote for this business.");
  const amountCents = dollarsToCents(parsed.data.amount);
  if (amountCents !== quote.proposedPriceCents) return actionError("The recorded payment must match the accepted quote total.");
  const existingPayment = db.select().from(payments).where(eq(payments.quoteId, quote.id)).get();
  if (existingPayment) return actionSuccess("Payment is already recorded for this quote.");
  const duplicateReference = db.select().from(payments).where(eq(payments.reference, parsed.data.reference)).get();
  if (duplicateReference) return actionError("That payment reference is already attached to another quote.");
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(payments)
      .values({
        id: id("pay"),
        businessId: parsed.data.businessId,
        quoteId: quote.id,
        amountCents,
        status: "paid",
        provider: "Manual record",
        reference: parsed.data.reference,
        paidAt: now,
        createdAt: now,
      })
      .run();
    tx.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quote.id)).run();
    tx.update(businesses)
      .set({ stage: "paid", nextAction: "Start build", nextActionAt: now, updatedAt: now })
      .where(eq(businesses.id, parsed.data.businessId))
      .run();
  });
  audit({ actorId: user.id, action: "payment.recorded", entityType: "business", entityId: parsed.data.businessId, detail: `Recorded full payment against quote ${quote.id}.` });
  revalidateBusiness(parsed.data.businessId);
  return actionSuccess("Payment recorded. The build is now unlocked.");
}

const businessIdSchema = z.object({ businessId: z.string().min(1) });

export async function startBuildAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = businessIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Business not found.");
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business) return actionError("Business not found.");
  if (business.stage !== "paid") return actionError("The business must be in the paid stage before a build can start.");
  const existingProject = db.select().from(projects).where(eq(projects.businessId, business.id)).get();
  if (existingProject) return actionSuccess("A build already exists for this business.");
  const workspace = await getWorkspaceSettings();
  const paid = db.select().from(payments).where(and(eq(payments.businessId, business.id), eq(payments.status, "paid"))).get();
  if (workspace.require_payment_before_build !== "false" && !paid) return actionError("Payment must be recorded before the build can start.");
  if (!business.requirements.trim()) return actionError("Add customer requirements before starting the build.");
  const now = new Date().toISOString();
  const projectId = id("prj");
  const runId = id("run");
  const previewToken = `${slugify(business.name)}-${randomBytes(16).toString("hex")}`;
  db.transaction((tx) => {
    tx.insert(projects)
      .values({
        id: projectId,
        businessId: business.id,
        status: "building",
        brief: business.requirements,
        previewToken,
        productionUrl: null,
        revisionCount: 0,
        deliveredAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.update(businesses)
      .set({ stage: "building", nextAction: "Review generated preview", nextActionAt: addDays(1), updatedAt: now })
      .where(eq(businesses.id, business.id))
      .run();
    tx.insert(automationRuns)
      .values({
        id: runId,
        type: "site_build",
        status: "succeeded",
        provider: "Local template adapter",
        mode: isSandbox() ? "sandbox" : "manual",
        summary: `Generated a persistent customer preview for ${business.name}.`,
        spendCents: 0,
        error: "",
        metadata: JSON.stringify({ businessId: business.id, projectId }),
        startedAt: now,
        finishedAt: now,
      })
      .run();
  });
  try {
    await createBuildArtifact({
      business,
      project: {
        id: projectId,
        businessId: business.id,
        status: "building",
        brief: business.requirements,
        previewToken,
        productionUrl: null,
        revisionCount: 0,
        deliveredAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    db.transaction((tx) => {
      tx.update(projects).set({ status: "review", updatedAt: new Date().toISOString() }).where(eq(projects.id, projectId)).run();
      tx.update(businesses).set({ stage: "review", nextAction: "Review verified build artifact", nextActionAt: addDays(1), updatedAt: new Date().toISOString() }).where(eq(businesses.id, business.id)).run();
      tx.update(automationRuns).set({ summary: `Generated and verified a static site artifact for ${business.name}.` }).where(eq(automationRuns.id, runId)).run();
    });
  } catch {
    db.update(automationRuns).set({ status: "failed", error: "Artifact generation or release checks failed.", finishedAt: new Date().toISOString() }).where(eq(automationRuns.id, runId)).run();
    return actionError("The site artifact could not be generated or verified.");
  }
  audit({ actorId: user.id, action: "project.artifact_verified", entityType: "project", entityId: projectId, detail: "Generated an isolated static site artifact and passed the deterministic release checks before customer review." });
  revalidateBusiness(business.id);
  revalidatePath("/build-studio");
  return actionSuccess("Build artifact passed release checks and is ready for customer review.");
}

export async function advanceProjectAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = z.object({ businessId: z.string().min(1), projectId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Project not found.");
  const db = getDb();
  const project = db.select().from(projects).where(and(eq(projects.id, parsed.data.projectId), eq(projects.businessId, parsed.data.businessId))).get();
  if (!project) return actionError("Project not found.");
  const next = nextProjectStage(project.status);
  if (!next) return actionError("This project is already complete.");
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(projects)
      .set({ status: next.projectStatus as typeof project.status, deliveredAt: next.projectStatus === "delivered" ? now : project.deliveredAt, updatedAt: now })
      .where(eq(projects.id, project.id))
      .run();
    tx.update(businesses)
      .set({ stage: next.businessStage, nextAction: projectNextAction(next.projectStatus), nextActionAt: next.projectStatus === "complete" ? null : addDays(1), updatedAt: now })
      .where(eq(businesses.id, parsed.data.businessId))
      .run();
  });
  audit({ actorId: user.id, action: "project.advanced", entityType: "business", entityId: parsed.data.businessId, detail: `Advanced the project to ${next.projectStatus}.` });
  revalidateBusiness(parsed.data.businessId);
  return actionSuccess(`Project moved to ${next.projectStatus}.`);
}

const requirementsSchema = z.object({
  businessId: z.string().min(1),
  requirements: z.string().trim().min(20, "Capture at least one concrete requirement.").max(8000),
  preferredStyle: z.string().trim().max(1000).default(""),
});

export async function saveRequirementsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = requirementsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the requirements.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business) return actionError("Business not found.");
  db.update(businesses)
    .set({ requirements: parsed.data.requirements, preferredStyle: parsed.data.preferredStyle, updatedAt: new Date().toISOString() })
    .where(eq(businesses.id, business.id))
    .run();
  audit({ actorId: user.id, action: "requirements.updated", entityType: "business", entityId: business.id, detail: "Updated the customer-approved scope and visual direction." });
  revalidateBusiness(business.id);
  return actionSuccess("Requirements saved.");
}

const messageSchema = z.object({
  businessId: z.string().min(1),
  direction: z.enum(["inbound", "outbound", "internal"]),
  subject: z.string().trim().max(180).default(""),
  body: z.string().trim().min(2, "Enter the message content.").max(8000),
});

export async function addMessageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the message.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).get();
  if (!business) return actionError("Business not found.");
  if (parsed.data.direction === "outbound" && !business.email.trim()) {
    return actionError("Capture a valid business email before sending a follow-up.");
  }
  const workspace = await getWorkspaceSettings();
  if (parsed.data.direction === "outbound") {
    if (workspace.block_dnc_outreach !== "false" && business.doNotCall) return actionError("Outbound contact is blocked for a do-not-call business.");
    if (workspace.require_call_before_email !== "false") {
      const priorCall = db.select().from(calls).where(eq(calls.businessId, business.id)).get();
      if (!priorCall) return actionError("Record the first phone call before adding an outbound follow-up email.");
    }
  }
  const recentDuplicate = db
    .select()
    .from(messages)
    .where(and(eq(messages.businessId, business.id), eq(messages.direction, parsed.data.direction), eq(messages.body, parsed.data.body)))
    .orderBy(desc(messages.createdAt))
    .get();
  if (recentDuplicate && Date.now() - new Date(recentDuplicate.createdAt).getTime() < 60_000) return actionSuccess("This message is already recorded.");
  const now = new Date().toISOString();
  let provider = "Local record";
  let status = parsed.data.direction === "inbound" ? "received" : "recorded";
  let deliveryDetail = "";
  if (parsed.data.direction === "outbound") {
    if (isSandbox()) {
      provider = "Sandbox email suppression";
      status = "suppressed";
      deliveryDetail = "Sandbox mode suppressed external email delivery.";
    } else {
      try {
        const delivery = await deliverTransactionalEmail({
          to: business.email,
          subject: parsed.data.subject || `BuildStax follow-up for ${business.name}`,
          text: parsed.data.body,
        });
        provider = `${delivery.provider}${delivery.runId ? ` run ${delivery.runId}` : ""}`;
        status = "sent";
        deliveryDetail = `Dispatched through ${delivery.provider} under the capped Zero email policy.`;
      } catch (error) {
        return actionError(safeEmailProviderMessage(error));
      }
    }
  }
  db.insert(messages)
    .values({
      id: id("msg"),
      businessId: business.id,
      direction: parsed.data.direction,
      channel: parsed.data.direction === "internal" ? "note" : "email",
      status,
      subject: parsed.data.subject,
      body: parsed.data.body,
      provider,
      createdAt: now,
    })
    .run();
  db.update(businesses)
    .set({ lastContactAt: parsed.data.direction === "internal" ? business.lastContactAt : now, updatedAt: now })
    .where(eq(businesses.id, business.id))
    .run();
  audit({ actorId: user.id, action: parsed.data.direction === "outbound" ? "email.dispatched" : "message.recorded", entityType: "business", entityId: business.id, detail: deliveryDetail || `Recorded a ${parsed.data.direction} ${parsed.data.direction === "internal" ? "note" : "email"}.` });
  revalidateBusiness(business.id);
  return actionSuccess(parsed.data.direction === "outbound"
    ? isSandbox() ? "Follow-up recorded; sandbox mode intentionally suppressed delivery." : "Follow-up email dispatched and added to the customer thread."
    : "Message recorded.");
}

const feedbackSchema = z.object({
  token: z.string().min(8).max(160),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]),
  feedback: z.string().trim().min(10, "Describe the change you need.").max(4000),
  company: z.string().max(0).optional(),
});

export async function submitPreviewFeedbackAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the feedback form.", z.flattenError(parsed.error).fieldErrors);
  const limit = consumeRateLimit(`preview:${parsed.data.token}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return actionError("Feedback limit reached. Try again later.");
  const db = getDb();
  const row = db
    .select({ project: projects, business: businesses })
    .from(projects)
    .innerJoin(businesses, eq(projects.businessId, businesses.id))
    .where(eq(projects.previewToken, parsed.data.token))
    .get();
  if (!row) return actionError("This preview link is not available.");
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(messages)
      .values({
        id: id("msg"),
        businessId: row.business.id,
        direction: "inbound",
        channel: "preview",
        status: "received",
        subject: "Preview feedback",
        body: parsed.data.feedback,
        provider: parsed.data.email ? `Customer preview (${parsed.data.email})` : "Customer preview",
        createdAt: now,
      })
      .run();
    tx.update(projects)
      .set({ status: "review", revisionCount: row.project.revisionCount + 1, updatedAt: now })
      .where(eq(projects.id, row.project.id))
      .run();
    tx.update(businesses)
      .set({ stage: "review", nextAction: "Review customer feedback", nextActionAt: now, updatedAt: now })
      .where(eq(businesses.id, row.business.id))
      .run();
  });
  audit({ actorId: "customer", action: "feedback.received", entityType: "business", entityId: row.business.id, detail: "Customer submitted feedback from the scoped preview link." });
  revalidatePath(`/preview/${parsed.data.token}`);
  revalidateBusiness(row.business.id);
  return actionSuccess("Feedback received. It is now in the project review queue.");
}

function revalidateBusiness(businessId: string) {
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath(`/businesses/${businessId}`);
  revalidatePath("/runs");
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function nextActionForCall(outcome: z.infer<typeof callSchema>["outcome"]) {
  return {
    interested: "Capture requirements",
    follow_up: "Place follow-up call",
    no_answer: "Retry call once",
    not_interested: "Closed — no next action",
    do_not_call: "No outreach permitted",
  }[outcome];
}

function projectNextAction(status: string) {
  return {
    building: "Review generated preview",
    review: "Collect customer feedback",
    delivered: "Confirm final acceptance",
    complete: "Project complete",
  }[status] ?? "Review project";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}
