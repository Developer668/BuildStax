"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutationUser } from "@/lib/auth/session";
import {
  businessStages,
  calculatePriceFloor,
  canManuallyTransitionStage,
  nextProjectStage,
  type BusinessStage,
} from "@/lib/domain";
import { createInsForgePublicClient, safeInsForgeMessage } from "@/lib/insforge/client";
import { requireInsForgeContext } from "@/lib/insforge/context";
import { mapBusiness, mapProject, mapQuote, type InsForgeRow } from "@/lib/insforge/map";
import { findWorkspaceRow, mutationId, recordInsForgeAudit } from "@/lib/insforge/mutate";
import { createBuildArtifact } from "@/lib/builds/artifact";
import { deliverTransactionalEmail, safeEmailProviderMessage } from "@/lib/integrations/email";
import { createQuoteCheckoutSession, safeStripeMessage } from "@/lib/integrations/stripe";
import { isSandbox } from "@/lib/utils";
import type { ActionState } from "./types";
import { actionError, actionSuccess, dollarsToCents } from "./helpers";

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
  const { client, admin, workspaceId } = await requireInsForgeContext();
  try {
    const duplicateResult = await client.database.from("businesses").select("id, name, phone")
      .eq("workspace_id", workspaceId).eq("phone", parsed.data.phone);
    if (duplicateResult.error) throw duplicateResult.error;
    const duplicate = ((duplicateResult.data ?? []) as InsForgeRow[]).some((row) => String(row.name).toLowerCase() === parsed.data.name.toLowerCase());
    if (duplicate) return actionError("That business and phone number are already in the pipeline.");
    if (parsed.data.campaignId && !(await findWorkspaceRow(client, workspaceId, "campaigns", parsed.data.campaignId))) {
      return actionError("The selected campaign no longer exists.");
    }
    const businessId = mutationId("biz");
    const now = new Date().toISOString();
    const result = await admin.database.from("businesses").insert([{
      id: businessId,
      workspace_id: workspaceId,
      campaign_id: parsed.data.campaignId || null,
      name: parsed.data.name,
      category: parsed.data.category,
      location: parsed.data.location,
      address: parsed.data.address,
      contact_name: parsed.data.contactName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      website_status: parsed.data.websiteStatus,
      source: "manual",
      source_ref: `Added by ${user.email}`,
      stage: "call_ready",
      score: 70,
      do_not_call: false,
      estimated_site_cost_cents: 90000,
      requirements: "",
      preferred_style: "",
      next_action: "Place first call",
      next_action_at: now,
      created_at: now,
      updated_at: now,
    }]);
    if (result.error) throw result.error;
    await recordInsForgeAudit(client, workspaceId, { actorId: user.id, action: "business.created", entityType: "business", entityId: businessId, detail: `Added ${parsed.data.name} to the call-ready queue.` });
    revalidatePath("/");
    revalidatePath("/pipeline");
    return actionSuccess("Business added.", `/businesses/${businessId}`);
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not add the business."));
  }
}

const stageSchema = z.object({ businessId: z.string().min(1), stage: z.enum(businessStages) });

export async function updateBusinessStageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Select a valid pipeline stage.");
  const { client, admin, workspaceId } = await requireInsForgeContext();
  try {
    const row = await findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId);
    if (!row) return actionError("Business not found.");
    const business = mapBusiness(row);
    if (!canManuallyTransitionStage(business.stage as BusinessStage, parsed.data.stage)) {
      return actionError("Use the call, quote, payment, or project control for evidence-backed stage changes.");
    }
    const result = await admin.database.from("businesses").update({
      stage: parsed.data.stage,
      do_not_call: parsed.data.stage === "dnc" ? true : business.doNotCall,
      next_action: parsed.data.stage === "dnc" ? "No outreach permitted" : business.nextAction,
      next_action_at: parsed.data.stage === "dnc" ? null : business.nextActionAt,
    }).eq("workspace_id", workspaceId).eq("id", business.id);
    if (result.error) throw result.error;
    await recordInsForgeAudit(client, workspaceId, { actorId: user.id, action: "business.stage_changed", entityType: "business", entityId: business.id, detail: `Moved ${business.name} from ${business.stage} to ${parsed.data.stage}.` });
    revalidateBusiness(business.id);
    return actionSuccess("Pipeline stage updated.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not update the stage."));
  }
}

const callSchema = z.object({
  businessId: z.string().min(1),
  outcome: z.enum(["interested", "follow_up", "no_answer", "not_interested", "do_not_call"]),
  summary: z.string().trim().min(10, "Add a useful call summary.").max(2000),
  transcript: z.string().trim().max(12000).default(""),
  durationMinutes: z.coerce.number().min(0).max(120),
});

export async function logCallAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireMutationUser();
  const parsed = callSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the call details.", z.flattenError(parsed.error).fieldErrors);
  const { client, workspaceId } = await requireInsForgeContext();
  const result = await client.database.rpc("log_buildstax_call", {
    p_workspace_id: workspaceId,
    p_call_id: mutationId("call"),
    p_business_id: parsed.data.businessId,
    p_outcome: parsed.data.outcome,
    p_summary: parsed.data.summary,
    p_transcript: parsed.data.transcript,
    p_duration_seconds: Math.round(parsed.data.durationMinutes * 60),
    p_provider: "Manual record",
    p_mode: "manual",
  });
  if (result.error) return actionError(safeInsForgeMessage(result.error, "The call could not be recorded. Check the outreach state."));
  revalidateBusiness(parsed.data.businessId);
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
  await requireMutationUser();
  const parsed = quoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the quote details.", z.flattenError(parsed.error).fieldErrors);
  const { client, workspaceId } = await requireInsForgeContext();
  try {
    const businessRow = await findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId);
    if (!businessRow) return actionError("Business not found.");
    const business = mapBusiness(businessRow);
    if (business.doNotCall) return actionError("A quote cannot be created for a do-not-call business.");
    if (!["interested", "quoted"].includes(business.stage)) return actionError("Record an interested call outcome before creating a quote.");
    const workspaceResult = await client.database.from("workspaces").select("default_pricing_floor_cents").eq("id", workspaceId).maybeSingle();
    if (workspaceResult.error || !workspaceResult.data) throw workspaceResult.error;
    let configuredFloorCents = Number((workspaceResult.data as InsForgeRow).default_pricing_floor_cents);
    if (business.campaignId) {
      const campaign = await findWorkspaceRow(client, workspaceId, "campaigns", business.campaignId);
      configuredFloorCents = Math.max(configuredFloorCents, Number(campaign?.pricing_floor_cents ?? 0));
    }
    const estimatedCostCents = dollarsToCents(parsed.data.estimatedCost);
    const proposedPriceCents = dollarsToCents(parsed.data.proposedPrice);
    const floor = calculatePriceFloor(estimatedCostCents, configuredFloorCents);
    if (proposedPriceCents < floor.enforcedFloorCents) {
      return actionError(`Price cannot be lower than $${(floor.enforcedFloorCents / 100).toLocaleString("en-US")} (the higher of 2x cost or the configured floor).`, {
        proposedPrice: ["Raise the customer price to the enforced floor or above."],
      });
    }
    const result = await client.database.rpc("create_buildstax_quote", {
      p_workspace_id: workspaceId,
      p_quote_id: mutationId("quo"),
      p_business_id: business.id,
      p_estimated_cost_cents: estimatedCostCents,
      p_proposed_price_cents: proposedPriceCents,
      p_scope: parsed.data.scope,
      p_expires_at: addDays(parsed.data.expiresInDays),
    });
    if (result.error) return actionError(safeInsForgeMessage(result.error, "The quote could not be recorded. Confirm that a completed phone call exists."));
    revalidateBusiness(business.id);
    return actionSuccess("Quote recorded and ready for follow-up.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not prepare the quote."));
  }
}

const paymentSchema = z.object({
  businessId: z.string().min(1),
  quoteId: z.string().min(1),
  amount: z.coerce.number().positive().max(250000),
  reference: z.string().trim().min(4, "Enter a payment reference.").max(100),
});

export async function recordPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireMutationUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the payment details.", z.flattenError(parsed.error).fieldErrors);
  return actionError("Manual payment records are disabled. Use verified Stripe Checkout for this quote.");
}

const checkoutSchema = z.object({
  businessId: z.string().min(1),
  quoteId: z.string().min(1),
});

export async function createStripeCheckoutAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const operator = await requireMutationUser();
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Select a valid quote.");
  const { client, admin, workspaceId } = await requireInsForgeContext();
  try {
    const [businessRow, quoteRow] = await Promise.all([
      findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId),
      findWorkspaceRow(client, workspaceId, "quotes", parsed.data.quoteId),
    ]);
    if (!businessRow || !quoteRow || String(quoteRow.business_id) !== parsed.data.businessId) {
      return actionError("The quoted business could not be found.");
    }
    const business = mapBusiness(businessRow);
    const quote = mapQuote(quoteRow);
    if (business.doNotCall || business.stage === "dnc") return actionError("Payment is blocked for a do-not-call business.");
    if (!["quoted", "payment_pending"].includes(business.stage) || !["sent", "accepted"].includes(quote.status)) {
      return actionError("This quote is not awaiting payment.");
    }

    const checkout = await createQuoteCheckoutSession({ workspaceId, business, quote, operator });
    const update = await admin.database.from("businesses").update({
      stage: "payment_pending",
      next_action: "Await verified Stripe payment",
      next_action_at: quote.expiresAt,
    }).eq("workspace_id", workspaceId).eq("id", business.id);
    if (update.error) throw update.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: operator.id,
      action: "payment.checkout_created",
      entityType: "business",
      entityId: business.id,
      detail: `Created Stripe ${checkout.environment} Checkout ${checkout.id} for the accepted quote.`,
    });
    revalidateBusiness(business.id);
    return actionSuccess("Secure Stripe Checkout is ready.", checkout.url);
  } catch (error) {
    return actionError(safeStripeMessage(error));
  }
}

const businessIdSchema = z.object({ businessId: z.string().min(1) });

export async function startBuildAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireMutationUser();
  const parsed = businessIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Business not found.");
  const { client, workspaceId } = await requireInsForgeContext();
  const businessRow = await findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId);
  if (!businessRow) return actionError("Business not found.");
  const business = mapBusiness(businessRow);
  if (business.stage !== "paid") return actionError("The business must be in the paid stage before a build can start.");
  if (!business.requirements.trim()) return actionError("Add customer requirements before starting the build.");
  const projectId = mutationId("prj");
  const previewToken = `${slugify(business.name)}-${randomBytes(16).toString("hex")}`;
  const result = await client.database.rpc("start_buildstax_project", {
    p_workspace_id: workspaceId,
    p_project_id: projectId,
    p_run_id: mutationId("run"),
    p_business_id: business.id,
    p_preview_token: previewToken,
    p_provider: "Platform build adapter",
    p_mode: isSandbox() ? "sandbox" : "manual",
  });
  if (result.error) return actionError(safeInsForgeMessage(result.error, "The build could not start. Confirm requirements and payment."));
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    const review = await client.database.rpc("advance_buildstax_project", {
      p_workspace_id: workspaceId,
      p_project_id: projectId,
      p_business_id: business.id,
    });
    if (review.error) throw review.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: (await requireMutationUser()).id,
      action: "project.artifact_verified",
      entityType: "project",
      entityId: projectId,
      detail: "Generated an isolated static site artifact and passed the deterministic release checks before customer review.",
    });
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "The site artifact could not be generated or verified."));
  }
  revalidateBusiness(business.id);
  revalidatePath("/build-studio");
  return actionSuccess("Build artifact passed release checks and is ready for customer review.");
}

export async function advanceProjectAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireMutationUser();
  const parsed = z.object({ businessId: z.string().min(1), projectId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Project not found.");
  const { client, workspaceId } = await requireInsForgeContext();
  const projectRow = await findWorkspaceRow(client, workspaceId, "projects", parsed.data.projectId);
  if (!projectRow || String(projectRow.business_id) !== parsed.data.businessId) return actionError("Project not found.");
  const project = mapProject(projectRow);
  const next = nextProjectStage(project.status);
  if (!next) return actionError("This project is already complete.");
  const result = await client.database.rpc("advance_buildstax_project", {
    p_workspace_id: workspaceId,
    p_project_id: project.id,
    p_business_id: parsed.data.businessId,
  });
  if (result.error) return actionError(safeInsForgeMessage(result.error, "The project could not be advanced."));
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
  const { client, admin, workspaceId } = await requireInsForgeContext();
  const business = await findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId);
  if (!business) return actionError("Business not found.");
  const result = await admin.database.from("businesses").update({ requirements: parsed.data.requirements, preferred_style: parsed.data.preferredStyle })
    .eq("workspace_id", workspaceId).eq("id", parsed.data.businessId);
  if (result.error) return actionError(safeInsForgeMessage(result.error, "Requirements could not be saved."));
  await recordInsForgeAudit(client, workspaceId, { actorId: user.id, action: "requirements.updated", entityType: "business", entityId: parsed.data.businessId, detail: "Updated the customer-approved scope and visual direction." });
  revalidateBusiness(parsed.data.businessId);
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
  const { client, admin, workspaceId } = await requireInsForgeContext();
  const businessRow = await findWorkspaceRow(client, workspaceId, "businesses", parsed.data.businessId);
  if (!businessRow) return actionError("Business not found.");
  const business = mapBusiness(businessRow);
  if (parsed.data.direction === "outbound" && !business.email.trim()) {
    return actionError("Capture a valid business email before sending a follow-up.");
  }
  const duplicateResult = await client.database.from("messages").select("id, created_at").eq("workspace_id", workspaceId)
    .eq("business_id", business.id).eq("direction", parsed.data.direction).eq("body", parsed.data.body)
    .order("created_at", { ascending: false }).limit(1);
  if (duplicateResult.error) return actionError("Message history could not be checked.");
  const duplicate = ((duplicateResult.data ?? []) as InsForgeRow[])[0];
  if (duplicate && Date.now() - new Date(String(duplicate.created_at)).getTime() < 60_000) return actionSuccess("This message is already recorded.");
  const now = new Date().toISOString();
  let provider = "Operator record";
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
  const insert = await admin.database.from("messages").insert([{
    id: mutationId("msg"), workspace_id: workspaceId, business_id: business.id,
    direction: parsed.data.direction, channel: parsed.data.direction === "internal" ? "note" : "email",
    status, subject: parsed.data.subject,
    body: parsed.data.body, provider, created_at: now,
  }]);
  if (insert.error) return actionError(safeInsForgeMessage(insert.error, "The message could not be recorded. Confirm the phone-first policy."));
  if (parsed.data.direction !== "internal") {
    const contactUpdate = await admin.database.from("businesses").update({ last_contact_at: now }).eq("workspace_id", workspaceId).eq("id", business.id);
    if (contactUpdate.error) return actionError(safeInsForgeMessage(contactUpdate.error, "The contact timestamp could not be updated."));
  }
  await recordInsForgeAudit(client, workspaceId, { actorId: user.id, action: parsed.data.direction === "outbound" ? "email.dispatched" : "message.recorded", entityType: "business", entityId: business.id, detail: deliveryDetail || `Recorded a ${parsed.data.direction} ${parsed.data.direction === "internal" ? "note" : "email"}.` });
  revalidateBusiness(business.id);
  return actionSuccess(parsed.data.direction === "outbound"
    ? isSandbox() ? "Follow-up recorded; sandbox mode intentionally suppressed delivery." : "Follow-up email dispatched and added to the customer thread."
    : "Message recorded.");
}

const feedbackSchema = z.object({
  token: z.string().min(8).max(200),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]),
  feedback: z.string().trim().min(12, "Describe the change you need.").max(4000),
  company: z.string().max(0).optional(),
});

export async function submitPreviewFeedbackAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the feedback form.", z.flattenError(parsed.error).fieldErrors);
  const client = createInsForgePublicClient();
  const result = await client.database.rpc("submit_buildstax_feedback", {
    p_token: parsed.data.token,
    p_email: parsed.data.email,
    p_feedback: parsed.data.feedback,
  });
  if (result.error) return actionError(safeInsForgeMessage(result.error, "Feedback could not be submitted. Try again later."));
  if (result.data !== true && !(Array.isArray(result.data) && result.data[0] === true)) return actionError("This preview link is not available.");
  revalidatePath(`/preview/${parsed.data.token}`);
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}
