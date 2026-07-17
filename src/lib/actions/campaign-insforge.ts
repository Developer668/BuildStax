"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutationUser } from "@/lib/auth/session";
import { AkashMLError, generateAkashPitch } from "@/lib/integrations/akashml";
import { safeInsForgeMessage } from "@/lib/insforge/client";
import { requireInsForgeContext } from "@/lib/insforge/context";
import { mapCampaign, type InsForgeRow } from "@/lib/insforge/map";
import { findWorkspaceRow, mutationId, recordInsForgeAudit } from "@/lib/insforge/mutate";
import { discoverProspectsWithZero } from "@/lib/providers/zero";
import { isSandbox } from "@/lib/utils";
import type { ActionState } from "./types";
import { actionError, actionSuccess, dollarsToCents } from "./helpers";

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
  const { client, workspaceId } = await requireInsForgeContext();
  try {
    const existingResult = await client.database.from("campaigns").select("name").eq("workspace_id", workspaceId);
    if (existingResult.error) throw existingResult.error;
    const duplicate = ((existingResult.data ?? []) as InsForgeRow[]).some(
      (row) => String(row.name).toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase(),
    );
    if (duplicate) return actionError("A campaign with this name already exists.");

    const campaignId = mutationId("cmp");
    const pitchId = mutationId("pit");
    const campaignResult = await client.database.rpc("create_buildstax_campaign", {
      p_workspace_id: workspaceId,
      p_campaign_id: campaignId,
      p_pitch_id: pitchId,
      p_name: parsed.data.name,
      p_vertical: parsed.data.vertical,
      p_region: parsed.data.region,
      p_daily_lead_limit: parsed.data.dailyLeadLimit,
      p_daily_spend_cap_cents: dollarsToCents(parsed.data.dailySpendCap),
      p_pricing_floor_cents: dollarsToCents(parsed.data.pricingFloor),
      p_pitch_script: parsed.data.pitchScript,
    });
    if (campaignResult.error) throw campaignResult.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "campaign.created",
      entityType: "campaign",
      entityId: campaignId,
      detail: `Created ${parsed.data.name} in draft status.`,
    });
    revalidatePath("/campaigns");
    return actionSuccess("Campaign created.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not create the campaign."));
  }
}

const updateCampaignSchema = campaignSchema.extend({
  campaignId: z.string().min(1),
  status: z.enum(["draft", "active", "paused", "archived"]),
});

export async function updateCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = updateCampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the campaign settings.", z.flattenError(parsed.error).fieldErrors);
  const { client, admin, workspaceId } = await requireInsForgeContext();
  try {
    const campaignRow = await findWorkspaceRow(client, workspaceId, "campaigns", parsed.data.campaignId);
    if (!campaignRow) return actionError("Campaign not found.");
    const campaign = mapCampaign(campaignRow);
    const namesResult = await client.database.from("campaigns").select("id, name").eq("workspace_id", workspaceId);
    if (namesResult.error) throw namesResult.error;
    const duplicate = ((namesResult.data ?? []) as InsForgeRow[]).some(
      (row) => String(row.id) !== campaign.id && String(row.name).toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase(),
    );
    if (duplicate) return actionError("A campaign with this name already exists.");
    const result = await admin.database.from("campaigns").update({
      name: parsed.data.name,
      vertical: parsed.data.vertical,
      region: parsed.data.region,
      status: parsed.data.status,
      daily_lead_limit: parsed.data.dailyLeadLimit,
      daily_spend_cap_cents: dollarsToCents(parsed.data.dailySpendCap),
      pricing_floor_cents: dollarsToCents(parsed.data.pricingFloor),
      pitch_script: parsed.data.pitchScript,
      updated_at: new Date().toISOString(),
    }).eq("workspace_id", workspaceId).eq("id", campaign.id);
    if (result.error) throw result.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "campaign.updated",
      entityType: "campaign",
      entityId: campaign.id,
      detail: `Updated campaign settings and set status to ${parsed.data.status}.`,
    });
    revalidatePath("/campaigns");
    revalidatePath("/pipeline");
    return actionSuccess("Campaign settings saved.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not update the campaign."));
  }
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
  const { client, admin, workspaceId } = await requireInsForgeContext();
  try {
    const campaign = await findWorkspaceRow(client, workspaceId, "campaigns", parsed.data.campaignId);
    if (!campaign) return actionError("Campaign not found.");
    const pitchId = mutationId("pit");
    const result = await admin.database.from("pitch_versions").insert([{
      id: pitchId,
      workspace_id: workspaceId,
      campaign_id: parsed.data.campaignId,
      label: parsed.data.label,
      script: parsed.data.script,
      status: "challenger",
      calls: 0,
      positive_outcomes: 0,
      created_at: new Date().toISOString(),
    }]);
    if (result.error) throw result.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "pitch.created",
      entityType: "campaign",
      entityId: parsed.data.campaignId,
      detail: `Added challenger pitch ${parsed.data.label}.`,
    });
    revalidatePath("/campaigns");
    return actionSuccess("Challenger pitch added.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not add the pitch version."));
  }
}

export async function generateAkashPitchAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireMutationUser();
  const parsed = z.object({ campaignId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Campaign not found.");
  const { client, workspaceId } = await requireInsForgeContext();
  const runId = mutationId("run");
  let reserved = false;
  try {
    const campaignRow = await findWorkspaceRow(client, workspaceId, "campaigns", parsed.data.campaignId);
    if (!campaignRow) return actionError("Campaign not found.");
    const campaign = mapCampaign(campaignRow);
    const configuredReservation = Number(process.env.AKASHML_PITCH_RESERVATION_CENTS ?? 25);
    const reservationCents = Number.isInteger(configuredReservation) && configuredReservation > 0
      ? Math.min(configuredReservation, 100000)
      : 25;
    const reservation = await client.database.rpc("reserve_buildstax_pitch_run_v2", {
      p_workspace_id: workspaceId,
      p_run_id: runId,
      p_campaign_id: campaign.id,
      p_reservation_cents: reservationCents,
      p_provider: "AkashML reserved request",
    });
    if (reservation.error) throw reservation.error;
    reserved = true;
    const draft = await generateAkashPitch({
      campaignId: campaign.id,
      campaignName: campaign.name,
      vertical: campaign.vertical,
      region: campaign.region,
      currentPitch: campaign.pitchScript,
    });
    const pitchId = mutationId("pit");
    const completed = await client.database.rpc("complete_buildstax_pitch_run", {
      p_workspace_id: workspaceId,
      p_run_id: runId,
      p_pitch_id: pitchId,
      p_label: draft.label,
      p_script: draft.script,
      p_provider: `AkashML / ${draft.model}`,
      p_metadata: {
        inferenceId: draft.inferenceId,
        inputTokens: draft.inputTokens,
        outputTokens: draft.outputTokens,
        rationale: draft.rationale,
      },
    });
    if (completed.error) throw completed.error;
    revalidatePath("/campaigns");
    revalidatePath("/runs");
    return actionSuccess("AkashML challenger added for review.");
  } catch (error) {
    const message = error instanceof AkashMLError ? error.message : safeInsForgeMessage(error, "The challenger could not be generated.");
    if (reserved) {
      await client.database.rpc("fail_buildstax_pitch_run", {
        p_workspace_id: workspaceId,
        p_run_id: runId,
        p_error: message,
      });
      revalidatePath("/runs");
    }
    return actionError(message);
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
  const parsed = z.object({ campaignId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Select a campaign.");
  const { client, admin, workspaceId } = await requireInsForgeContext();
  const sandbox = isSandbox();
  const runId = mutationId("run");
  let reserved = false;
  try {
    const campaignRow = await findWorkspaceRow(client, workspaceId, "campaigns", parsed.data.campaignId);
    if (!campaignRow) return actionError("Campaign not found.");
    const campaign = mapCampaign(campaignRow);
    if (campaign.status === "archived") return actionError("Archived campaigns cannot receive new prospects.");
    if (!sandbox) {
      if (campaign.status !== "active") return actionError("Activate the campaign before running live Zero discovery.");
      const reservation = await client.database.rpc("reserve_buildstax_discovery_run", {
        p_workspace_id: workspaceId,
        p_run_id: runId,
        p_campaign_id: campaign.id,
        p_reservation_cents: 2,
        p_provider: "Zero capability reservation",
      });
      if (reservation.error) throw reservation.error;
      reserved = true;

      const discovery = await discoverProspectsWithZero({
        category: campaign.vertical,
        area: campaign.region,
        count: Math.min(campaign.dailyLeadLimit, 25),
      });
      const completed = await client.database.rpc("complete_buildstax_discovery_run", {
        p_workspace_id: workspaceId,
        p_run_id: runId,
        p_provider: `Zero / ${discovery.provider}`,
        p_businesses: discovery.prospects.map((prospect) => ({
          id: mutationId("biz"),
          name: prospect.name,
          category: prospect.category,
          location: prospect.location,
          address: prospect.address,
          phone: prospect.phone,
          source_ref: prospect.sourceRef,
        })),
        p_metadata: {
          zeroRunId: discovery.runId,
          providerCostCents: discovery.costCents,
          qualifiedCount: discovery.prospects.length,
        },
      });
      if (completed.error) throw completed.error;
      const imported = Number(completed.data ?? 0);
      revalidatePath("/");
      revalidatePath("/pipeline");
      revalidatePath("/campaigns");
      revalidatePath("/runs");
      return actionSuccess(`Zero qualified and imported ${imported} prospect${imported === 1 ? "" : "s"}.`);
    }

    const existingResult = await client.database.from("businesses").select("name").eq("workspace_id", workspaceId).eq("campaign_id", campaign.id);
    if (existingResult.error) throw existingResult.error;
    const existingNames = new Set(((existingResult.data ?? []) as InsForgeRow[]).map((row) => String(row.name)));
    const selected = sandboxProspects.filter(([name]) => !existingNames.has(name)).slice(0, Math.min(3, campaign.dailyLeadLimit));
    if (!selected.length) return actionSuccess("The sandbox prospect set is already fully imported.");
    const now = new Date().toISOString();
    const insertResult = await admin.database.from("businesses").insert(selected.map(([name, category, location, phone], index) => ({
      id: mutationId("biz"),
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      name,
      category,
      location,
      address: "",
      contact_name: "",
      phone,
      email: "",
      website_status: "none",
      source: "sandbox",
      source_ref: `Local discovery fixture ${index + 1}`,
      stage: "discovered",
      score: 78 - index * 3,
      do_not_call: false,
      estimated_site_cost_cents: 90000,
      requirements: "",
      preferred_style: "",
      next_action: "Verify contact and call eligibility",
      next_action_at: now,
      created_at: now,
      updated_at: now,
    })));
    if (insertResult.error) throw insertResult.error;
    const runResult = await admin.database.from("automation_runs").insert([{
      id: mutationId("run"),
      workspace_id: workspaceId,
      type: "discovery",
      status: "succeeded",
      provider: "Sandbox fixture",
      mode: "sandbox",
      summary: `Added ${selected.length} clearly labeled local prospects to ${campaign.name}.`,
      spend_cents: 0,
      error: "",
      metadata: { campaignId: campaign.id, count: selected.length },
      started_at: now,
      finished_at: now,
    }]);
    if (runResult.error) throw runResult.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "discovery.sandbox_completed",
      entityType: "campaign",
      entityId: campaign.id,
      detail: `Imported ${selected.length} sandbox prospects without external calls or charges.`,
    });
    revalidatePath("/");
    revalidatePath("/pipeline");
    revalidatePath("/campaigns");
    revalidatePath("/runs");
    return actionSuccess(`${selected.length} sandbox prospects added.`);
  } catch (error) {
    const message = safeInsForgeMessage(error, sandbox ? "InsForge could not import the sandbox prospects." : "Zero discovery could not complete safely.");
    if (reserved) {
      await client.database.rpc("fail_buildstax_discovery_run", {
        p_workspace_id: workspaceId,
        p_run_id: runId,
        p_error: message,
      });
      revalidatePath("/runs");
    }
    return actionError(message);
  }
}
