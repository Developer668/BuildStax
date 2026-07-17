#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createAdminClient, createClient } from "@insforge/sdk";

function loadEnvFile(path) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!process.env[key]) process.env[key] = line.slice(separator + 1);
  }
}

function sqlLiteral(value) {
  return value.replaceAll("'", "''");
}

function executeSql(query) {
  execFileSync("npx", ["@insforge/cli", "db", "query", query], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

loadEnvFile(".env.local");
const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const apiKey = process.env.INSFORGE_API_KEY;
if (!baseUrl || !anonKey || !apiKey) throw new Error("The linked InsForge runtime configuration is incomplete.");

const userId = crypto.randomUUID();
const email = `rpc-${Date.now()}@buildstax.invalid`;
const password = `T3st!${crypto.randomBytes(18).toString("hex")}`;
let workspaceId = "";

try {
  executeSql(`
    INSERT INTO auth.users(id, email, password, email_verified)
    VALUES (
      '${userId}',
      '${sqlLiteral(email)}',
      crypt('${sqlLiteral(password)}', gen_salt('bf')),
      TRUE
    )
  `);

  const user = createClient({ baseUrl, anonKey });
  const signedIn = await user.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data?.user) throw signedIn.error ?? new Error("InsForge test sign-in failed.");

  const bootstrap = await user.database.rpc("bootstrap_workspace", {
    p_name: "RPC verification",
    p_email: email,
    p_display_name: "RPC verifier",
  });
  if (bootstrap.error) throw bootstrap.error;
  workspaceId = Array.isArray(bootstrap.data) ? String(bootstrap.data[0]) : String(bootstrap.data);

  const audit = await user.database.rpc("record_buildstax_audit_v2", {
    p_workspace_id: workspaceId,
    p_audit_id: `aud_${crypto.randomUUID()}`,
    p_action: "rpc.verified",
    p_entity_type: "workspace",
    p_entity_id: workspaceId,
    p_detail: "Verified authenticated audit and outbox semantics.",
  });
  if (audit.error) throw audit.error;
  const outbox = await user.database.from("integration_outbox")
    .select("status, payload")
    .eq("workspace_id", workspaceId)
    .eq("event_type", "rpc.verified");
  if (outbox.error || outbox.data?.length !== 1) throw outbox.error ?? new Error("The transactional outbox row is missing.");

  const campaignId = `cmp_${crypto.randomUUID()}`;
  const campaign = await user.database.rpc("create_buildstax_campaign", {
    p_workspace_id: workspaceId,
    p_campaign_id: campaignId,
    p_pitch_id: `pit_${crypto.randomUUID()}`,
    p_name: "RPC Verification",
    p_vertical: "Retail",
    p_region: "Oakland",
    p_daily_lead_limit: 5,
    p_daily_spend_cap_cents: 2,
    p_pricing_floor_cents: 150000,
    p_pitch_script: "A complete phone-first verification pitch that never invents customer facts.",
  });
  if (campaign.error) throw campaign.error;

  const admin = createAdminClient({ baseUrl, apiKey });
  const activated = await admin.database.from("campaigns").update({ status: "active" })
    .eq("workspace_id", workspaceId).eq("id", campaignId);
  if (activated.error) throw activated.error;

  const runId = `run_${crypto.randomUUID()}`;
  const reservation = await user.database.rpc("reserve_buildstax_discovery_run", {
    p_workspace_id: workspaceId,
    p_run_id: runId,
    p_campaign_id: campaignId,
    p_reservation_cents: 2,
    p_provider: "Zero verification",
  });
  if (reservation.error) throw reservation.error;
  const failed = await user.database.rpc("fail_buildstax_discovery_run", {
    p_workspace_id: workspaceId,
    p_run_id: runId,
    p_error: "Intentional verification stop before provider execution.",
  });
  if (failed.error) throw failed.error;
  const run = await user.database.from("automation_runs").select("status, spend_cents")
    .eq("workspace_id", workspaceId).eq("id", runId).maybeSingle();
  if (run.error || run.data?.status !== "failed" || Number(run.data?.spend_cents) !== 2) {
    throw run.error ?? new Error("The spend reservation evidence is invalid.");
  }

  process.stdout.write(`${JSON.stringify({
    authenticatedRpc: true,
    outboxStatus: outbox.data[0].status,
    reservationStatus: run.data.status,
    reservedCents: Number(run.data.spend_cents),
  })}\n`);
} finally {
  executeSql(`
    DELETE FROM public.workspaces WHERE created_by = '${userId}';
    DELETE FROM auth.users WHERE id = '${userId}'
  `);
}
