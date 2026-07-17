#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(import.meta.dirname, "..");

function projectApiKey() {
  const output = execFileSync("npx", ["@insforge/cli", "secrets", "get", "API_KEY"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const value = output.trim().split(/\s*=\s*/).at(-1)?.trim();
  if (!value || value.length < 20 || /\s/.test(value)) {
    throw new Error("InsForge did not return a usable project API key.");
  }
  return value;
}

function textContent(result) {
  return (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function assertToolSuccess(name, result) {
  if (result.isError) throw new Error(`${name} failed.`);
  return textContent(result);
}

const project = JSON.parse(readFileSync(resolve(root, ".insforge/project.json"), "utf8"));
if (!project.oss_host) throw new Error("The linked InsForge project has no backend URL.");

const transport = new StdioClientTransport({
  command: resolve(root, "node_modules/.bin/insforge-mcp"),
  args: ["--api_key", projectApiKey(), "--api_base_url", project.oss_host],
  stderr: "pipe",
});
const client = new Client({ name: "buildstax-backend-verifier", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const required = ["fetch-docs", "get-backend-metadata", "get-table-schema", "run-raw-sql"];
  for (const name of required) {
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`InsForge MCP is missing ${name}.`);
  }

  assertToolSuccess("fetch-docs", await client.callTool({
    name: "fetch-docs",
    arguments: { docType: "instructions" },
  }));
  assertToolSuccess("get-backend-metadata", await client.callTool({
    name: "get-backend-metadata",
    arguments: {},
  }));
  assertToolSuccess("get-table-schema", await client.callTool({
    name: "get-table-schema",
    arguments: { tableName: "payments" },
  }));

  const verification = await client.callTool({
    name: "run-raw-sql",
    arguments: {
      query: `
        SELECT
          (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_tables,
          (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public') AS public_rls_policies,
          (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS public_triggers,
          (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'payments' AND c.relname = 'webhook_events' AND NOT t.tgisinternal AND t.tgname IN ('fulfill_buildstax_stripe_payment', 'validate_buildstax_stripe_environment')) AS payment_webhook_triggers,
          (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE '%buildstax%') AS buildstax_functions,
          (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'validate_buildstax_stripe_environment') AS stripe_environment_guards,
          (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) AS direct_write_grants,
          (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'integration_outbox') AS integration_outbox_tables,
          has_function_privilege('authenticated', 'public.record_buildstax_payment(uuid,text,text,text,integer,text)', 'EXECUTE') AS manual_payment_executable,
          has_function_privilege('authenticated', 'public.reserve_buildstax_pitch_run(uuid,text,text,integer,text)', 'EXECUTE') AS pitch_reservation_executable,
          (SELECT count(*)::int FROM payments.webhook_events WHERE provider = 'stripe' AND processing_status = 'processed' AND payload #>> '{data,object,metadata,buildstax_application}' = 'buildstax') AS verified_stripe_events,
          (SELECT count(*)::int FROM public.payments WHERE provider = 'Stripe test' AND status = 'paid') AS stripe_test_payments,
          (SELECT count(*)::int FROM public.businesses WHERE stage = 'won') AS completed_businesses,
          (SELECT count(*)::int FROM public.messages WHERE channel = 'preview') AS preview_feedback_messages
      `,
      params: [],
    },
  });
  const result = assertToolSuccess("run-raw-sql", verification);
  const counts = result.match(/"rows"\s*:\s*(\[[\s\S]*?\])/i)?.[1];
  if (!counts) throw new Error("InsForge MCP returned an unexpected verification shape.");
  const rows = JSON.parse(counts);
  const summary = rows[0];
  if (!summary || summary.public_tables < 14 || summary.public_rls_policies < 13 || summary.public_triggers < 22 || summary.payment_webhook_triggers !== 2 || summary.buildstax_functions < 18 || summary.stripe_environment_guards !== 1 || summary.direct_write_grants !== 0 || summary.integration_outbox_tables !== 1 || summary.manual_payment_executable !== false || summary.pitch_reservation_executable !== true) {
    throw new Error("InsForge MCP detected an incomplete BuildStax schema or payment guard.");
  }

  const transientRateKey = `mcp:verification:${Date.now()}`;
  const rateVerification = await client.callTool({
    name: "run-raw-sql",
    arguments: {
      query: `
        SELECT public.consume_buildstax_rate_limit($1, 1, 60) AS state
      `,
      params: [transientRateKey],
    },
  });
  const rateResult = assertToolSuccess("run-raw-sql rate-limit verification", rateVerification);
  const cleanupVerification = await client.callTool({
    name: "run-raw-sql",
    arguments: {
      query: "DELETE FROM public.rate_limits WHERE key = $1 RETURNING key",
      params: [transientRateKey],
    },
  });
  const cleanupResult = assertToolSuccess("run-raw-sql rate-limit cleanup", cleanupVerification);
  if (!/"allowed"\s*:\s*true/.test(rateResult) || !/"rowCount"\s*:\s*1/.test(cleanupResult)) {
    throw new Error("InsForge MCP could not verify the durable rate-limit mutation path.");
  }
  process.stdout.write(`InsForge MCP verified ${required.length} required tools.\n${counts}\n`);
} finally {
  await client.close();
}
