"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutationUser } from "@/lib/auth/session";
import { getExternalIntegrationReadiness } from "@/lib/integrations/readiness";
import { safeInsForgeMessage } from "@/lib/insforge/client";
import { requireInsForgeContext } from "@/lib/insforge/context";
import { mutationId, recordInsForgeAudit } from "@/lib/insforge/mutate";
import type { ActionState } from "./types";
import { actionError, actionSuccess, dollarsToCents } from "./helpers";

const settingsSchema = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  pricingFloor: z.coerce.number().positive().max(250000),
  currency: z.literal("USD"),
  timezone: z.string().trim().min(3).max(80),
  requireCallBeforeEmail: z.string().optional(),
});

export async function updateWorkspaceSettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMutationUser();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionError("Check the workspace settings.", z.flattenError(parsed.error).fieldErrors);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone }).format();
  } catch {
    return actionError("Enter a valid IANA timezone, such as America/Los_Angeles.", { timezone: ["Unknown timezone."] });
  }
  const { client, admin, workspaceId } = await requireInsForgeContext();
  try {
    const result = await admin.database.from("workspaces").update({
      name: parsed.data.workspaceName,
      default_pricing_floor_cents: dollarsToCents(parsed.data.pricingFloor),
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      require_call_before_email: parsed.data.requireCallBeforeEmail === "on",
      block_dnc_outreach: true,
      require_payment_before_build: true,
      updated_at: new Date().toISOString(),
    }).eq("id", workspaceId);
    if (result.error) throw result.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "settings.updated",
      entityType: "workspace",
      entityId: workspaceId,
      detail: "Updated pricing, locale, and workflow guardrails.",
    });
    revalidatePath("/settings");
    revalidatePath("/");
    return actionSuccess("Workspace settings saved.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not save the workspace settings."));
  }
}

export async function auditIntegrationsAction(previousState: ActionState): Promise<ActionState> {
  void previousState;
  const user = await requireMutationUser();
  const { client, admin, workspaceId } = await requireInsForgeContext();
  const checks = await getExternalIntegrationReadiness();
  const now = new Date().toISOString();
  const entries = Object.entries(checks);
  try {
    const result = await admin.database.from("automation_runs").insert(entries.map(([provider, check]) => ({
      id: mutationId("run"),
      workspace_id: workspaceId,
      type: "integration_audit",
      status: check.status === "ready" ? "succeeded" : "blocked",
      provider: provider === "akashml" ? "AkashML" : provider === "nexla" ? "Nexla" : provider === "pomerium" ? "Pomerium Zero" : provider === "stripe" ? "Stripe test" : "Zero",
      mode: "manual",
      summary: check.detail,
      spend_cents: 0,
      error: check.status === "missing" ? check.detail : "",
      metadata: check.metadata,
      started_at: now,
      finished_at: new Date().toISOString(),
    })));
    if (result.error) throw result.error;
    await recordInsForgeAudit(client, workspaceId, {
      actorId: user.id,
      action: "integrations.audited",
      entityType: "workspace",
      entityId: workspaceId,
      detail: "Checked Zero, Nexla, AkashML, Stripe, and Pomerium readiness without exposing credentials.",
    });
    revalidatePath("/integrations");
    revalidatePath("/runs");
    return actionSuccess("Integration readiness checked and recorded.");
  } catch (error) {
    return actionError(safeInsForgeMessage(error, "InsForge could not record the integration audit."));
  }
}
