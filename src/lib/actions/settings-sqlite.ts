"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutationUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { automationRuns, settings } from "@/lib/db/schema";
import { getExternalIntegrationReadiness } from "@/lib/integrations/readiness";
import type { ActionState } from "./types";
import { actionError, actionSuccess, audit, dollarsToCents, id } from "./helpers";

const settingsSchema = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  pricingFloor: z.coerce.number().positive().max(250000),
  currency: z.enum(["USD", "CAD", "EUR", "GBP"]),
  timezone: z.string().trim().min(3).max(80),
  requireCallBeforeEmail: z.string().optional(),
  blockDncOutreach: z.string().optional(),
  requirePaymentBeforeBuild: z.string().optional(),
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
  const values: Record<string, string> = {
    workspace_name: parsed.data.workspaceName,
    default_pricing_floor_cents: String(dollarsToCents(parsed.data.pricingFloor)),
    currency: parsed.data.currency,
    timezone: parsed.data.timezone,
    require_call_before_email: String(parsed.data.requireCallBeforeEmail === "on"),
    block_dnc_outreach: String(parsed.data.blockDncOutreach === "on"),
    require_payment_before_build: String(parsed.data.requirePaymentBeforeBuild === "on"),
  };
  const now = new Date().toISOString();
  const db = getDb();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(values)) {
      tx.insert(settings).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } }).run();
    }
  });
  audit({ actorId: user.id, action: "settings.updated", entityType: "workspace", entityId: "default", detail: "Updated pricing, locale, and workflow guardrails." });
  revalidatePath("/settings");
  revalidatePath("/");
  return actionSuccess("Workspace settings saved.");
}

export async function auditIntegrationsAction(previousState: ActionState): Promise<ActionState> {
  void previousState;
  const user = await requireMutationUser();
  const readiness = await getExternalIntegrationReadiness();
  const checks = Object.values(readiness);
  const now = new Date().toISOString();
  getDb()
    .insert(automationRuns)
    .values({
      id: id("run"),
      type: "integration_audit",
      status: checks.every((check) => check.status === "ready") ? "succeeded" : "blocked",
      provider: "Local environment",
      mode: "manual",
      summary: `Checked Zero, Nexla, AkashML, Stripe, and Pomerium; ${checks.filter((check) => check.status === "ready").length} of ${checks.length} are ready.`,
      spendCents: 0,
      error: checks.some((check) => check.status === "missing") ? "One or more integration prerequisites are missing." : "",
      metadata: JSON.stringify(readiness),
      startedAt: now,
      finishedAt: now,
    })
    .run();
  audit({ actorId: user.id, action: "integrations.audited", entityType: "workspace", entityId: "default", detail: "Checked integration readiness without printing or transmitting credentials." });
  revalidatePath("/integrations");
  revalidatePath("/runs");
  return actionSuccess("Integration readiness checked and recorded.");
}
