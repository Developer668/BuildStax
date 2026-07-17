"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutationUser } from "@/lib/auth/session";
import { AkashMLError, generateAkashPitch } from "@/lib/integrations/akashml";
import { getDb } from "@/lib/db";
import { automationRuns, businesses, campaigns, pitchVersions } from "@/lib/db/schema";
import { isSandbox } from "@/lib/utils";
import type { ActionState } from "./types";
import { actionError, actionSuccess, audit, dollarsToCents, id } from "./helpers";

const campaignSchema = z.object({
  name: z.string().trim().min(3, "Enter a campaign name.").max(120),
  vertical: z.string().trim().min(2, "Enter a target vertical.").max(100),
  region: z.string().trim().min(2, "Enter a target region.").max(120),
  dailyLeadLimit: z.coerce.number().int().min(1).max(500),
  dailySpendCap: z.coerce.number().min(0).max(10000),
  pricingFloor: z.coerce.number().positive().max(250000),
  pitchScript: z.string().trim().min(40, "Write a complete opening pitch.").max(8000),
});

export async function createCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the campaign details.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const duplicate = db.select().from(campaigns).where(sql`lower(${campaigns.name}) = ${parsed.data.name.toLowerCase()}`).get();
  if (duplicate) return actionError("A campaign with this name already exists.");
  const campaignId = id("cmp");
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(campaigns)
      .values({
        id: campaignId,
        name: parsed.data.name,
        vertical: parsed.data.vertical,
        region: parsed.data.region,
        status: "draft",
        dailyLeadLimit: parsed.data.dailyLeadLimit,
        dailySpendCapCents: dollarsToCents(parsed.data.dailySpendCap),
        pricingFloorCents: dollarsToCents(parsed.data.pricingFloor),
        pitchScript: parsed.data.pitchScript,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(pitchVersions)
      .values({
        id: id("pit"),
        campaignId,
        label: "Initial pitch",
        script: parsed.data.pitchScript,
        status: "active",
        calls: 0,
        positiveOutcomes: 0,
        createdAt: now,
      })
      .run();
  });
  audit({ actorId: user.id, action: "campaign.created", entityType: "campaign", entityId: campaignId, detail: `Created ${parsed.data.name} in draft status.` });
  revalidatePath("/campaigns");
  return actionSuccess("Campaign created.");
}

const updateCampaignSchema = campaignSchema.extend({ campaignId: z.string().min(1), status: z.enum(["draft", "active", "paused", "archived"]) });

export async function updateCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = updateCampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the campaign settings.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, parsed.data.campaignId)).get();
  if (!campaign) return actionError("Campaign not found.");
  db.update(campaigns)
    .set({
      name: parsed.data.name,
      vertical: parsed.data.vertical,
      region: parsed.data.region,
      status: parsed.data.status,
      dailyLeadLimit: parsed.data.dailyLeadLimit,
      dailySpendCapCents: dollarsToCents(parsed.data.dailySpendCap),
      pricingFloorCents: dollarsToCents(parsed.data.pricingFloor),
      pitchScript: parsed.data.pitchScript,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaigns.id, campaign.id))
    .run();
  audit({ actorId: user.id, action: "campaign.updated", entityType: "campaign", entityId: campaign.id, detail: `Updated campaign settings and set status to ${parsed.data.status}.` });
  revalidatePath("/campaigns");
  revalidatePath("/pipeline");
  return actionSuccess("Campaign settings saved.");
}

const pitchSchema = z.object({
  campaignId: z.string().min(1),
  label: z.string().trim().min(2, "Name this pitch version.").max(80),
  script: z.string().trim().min(40, "Write a complete pitch.").max(8000),
});

export async function createPitchVersionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = pitchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the pitch version.", z.flattenError(parsed.error).fieldErrors);
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, parsed.data.campaignId)).get();
  if (!campaign) return actionError("Campaign not found.");
  db.insert(pitchVersions)
    .values({
      id: id("pit"),
      campaignId: campaign.id,
      label: parsed.data.label,
      script: parsed.data.script,
      status: "challenger",
      calls: 0,
      positiveOutcomes: 0,
      createdAt: new Date().toISOString(),
    })
    .run();
  audit({ actorId: user.id, action: "pitch.created", entityType: "campaign", entityId: campaign.id, detail: `Added challenger pitch ${parsed.data.label}.` });
  revalidatePath("/campaigns");
  return actionSuccess("Challenger pitch added.");
}

export async function generateAkashPitchAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = z.object({ campaignId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Campaign not found.");
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, parsed.data.campaignId)).get();
  if (!campaign) return actionError("Campaign not found.");
  const startedAt = new Date().toISOString();
  try {
    const draft = await generateAkashPitch({
      campaignId: campaign.id,
      campaignName: campaign.name,
      vertical: campaign.vertical,
      region: campaign.region,
      currentPitch: campaign.pitchScript,
    });
    const pitchId = id("pit");
    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.insert(pitchVersions).values({
        id: pitchId,
        campaignId: campaign.id,
        label: draft.label,
        script: draft.script,
        status: "challenger",
        calls: 0,
        positiveOutcomes: 0,
        createdAt: now,
      }).run();
      tx.insert(automationRuns).values({
        id: id("run"),
        type: "pitch_generation",
        status: "succeeded",
        provider: `AkashML · ${draft.model}`,
        mode: "live",
        summary: `Generated a schema-validated challenger for ${campaign.name}; operator review is still required.`,
        spendCents: 0,
        error: "",
        metadata: JSON.stringify({ campaignId: campaign.id, pitchId, inferenceId: draft.inferenceId, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, rationale: draft.rationale }),
        startedAt,
        finishedAt: now,
      }).run();
    });
    audit({ actorId: user.id, action: "pitch.akashml_generated", entityType: "campaign", entityId: campaign.id, detail: `AkashML generated challenger ${draft.label}; it remains inactive pending operator review.` });
    revalidatePath("/campaigns");
    revalidatePath("/runs");
    return actionSuccess("AkashML challenger added for review.");
  } catch (error) {
    return actionError(error instanceof AkashMLError ? error.message : "The challenger could not be generated.");
  }
}

const sandboxProspects = [
  ["Cypress Bicycle Repair", "Bicycle repair", "Piedmont Ave, Oakland", "+1 510 555 0201"],
  ["Ember Yoga Studio", "Yoga studio", "Grand Lake, Oakland", "+1 510 555 0202"],
  ["Juniper Bookkeeping", "Bookkeeping", "North Berkeley", "+1 510 555 0203"],
  ["Sable House Cleaning", "Home cleaning", "Alameda", "+1 510 555 0204"],
  ["Fieldwork Piano Service", "Piano tuning", "Albany, CA", "+1 510 555 0205"],
  ["Moss & Kiln Ceramics", "Ceramics studio", "Fruitvale, Oakland", "+1 510 555 0206"],
] as const;

export async function runSandboxDiscoveryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  if (!isSandbox()) return actionError("Sandbox discovery is unavailable in production mode.");
  const parsed = z.object({ campaignId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Select a campaign.");
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, parsed.data.campaignId)).get();
  if (!campaign) return actionError("Campaign not found.");
  if (campaign.status === "archived") return actionError("Archived campaigns cannot receive new prospects.");
  const available = sandboxProspects.filter(([name]) => {
    return !db.select().from(businesses).where(and(eq(businesses.campaignId, campaign.id), eq(businesses.name, name))).get();
  });
  if (!available.length) return actionSuccess("The sandbox prospect set is already fully imported.");
  const selected = available.slice(0, Math.min(3, campaign.dailyLeadLimit));
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(businesses)
      .values(
        selected.map(([name, category, location, phone], index) => ({
          id: id("biz"),
          campaignId: campaign.id,
          name,
          category,
          location,
          address: "",
          contactName: "",
          phone,
          email: "",
          websiteStatus: "none" as const,
          source: "sandbox",
          sourceRef: `Local discovery fixture ${index + 1}`,
          stage: "discovered",
          score: 78 - index * 3,
          doNotCall: false,
          estimatedSiteCostCents: 90000,
          requirements: "",
          preferredStyle: "",
          nextAction: "Verify contact and call eligibility",
          nextActionAt: now,
          lastContactAt: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
    tx.insert(automationRuns)
      .values({
        id: id("run"),
        type: "discovery",
        status: "succeeded",
        provider: "Sandbox fixture",
        mode: "sandbox",
        summary: `Added ${selected.length} clearly labeled local prospects to ${campaign.name}.`,
        spendCents: 0,
        error: "",
        metadata: JSON.stringify({ campaignId: campaign.id, count: selected.length }),
        startedAt: now,
        finishedAt: now,
      })
      .run();
  });
  audit({ actorId: user.id, action: "discovery.sandbox_completed", entityType: "campaign", entityId: campaign.id, detail: `Imported ${selected.length} sandbox prospects without external calls or charges.` });
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/campaigns");
  revalidatePath("/runs");
  return actionSuccess(`${selected.length} sandbox prospects added.`);
}
