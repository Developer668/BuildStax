#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function command(args, env = process.env) {
  return execFileSync("nexla-cli", args, {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const apiUrl = process.env.NEXLA_API_URL;
const serviceKey = process.env.NEXLA_SERVICE_KEY;
const toolsetId = process.env.NEXLA_TOOLSET_ID;
if (!apiUrl || !serviceKey || !toolsetId) {
  throw new Error("NEXLA_API_URL, NEXLA_SERVICE_KEY, and NEXLA_TOOLSET_ID are required.");
}

const sessionToken = command(["login", "--service-key", serviceKey, "--api-url", apiUrl]);
const toolset = JSON.parse(command(["toolsets", "get", toolsetId, "--output", "json"], {
  ...process.env,
  NEXLA_API_URL: apiUrl,
  NEXLA_TOKEN: sessionToken,
}));
if (toolset.status !== "active" || !toolset.mcp_gateway_enabled || !toolset.mcp_url_service_key) {
  throw new Error("The configured Nexla MCP toolset is not active.");
}

async function rpc(method, params, id) {
  const response = await fetch(toolset.mcp_url_service_key, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || `Nexla MCP returned HTTP ${response.status}.`);
  }
  return result.result;
}

const initialized = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "buildstax-nexla-verifier", version: "1.0.0" },
}, 1);
if (initialized.serverInfo?.name !== "nexla-mcpaas") {
  throw new Error("The Nexla MCP gateway returned unexpected server metadata.");
}

const listed = await rpc("tools/list", {}, 2);
const readTool = listed.tools?.find((tool) => tool.name === "nexset_read_buildstax_durable_agent_context");
if (!readTool) throw new Error("The scoped BuildStax Nexset read tool is missing.");

const called = await rpc("tools/call", {
  name: readTool.name,
  arguments: { limit: 10, offset: 0 },
}, 3);
if (called.isError || typeof called.structuredContent?.result !== "string") {
  throw new Error("The BuildStax Nexset tool call failed.");
}

const envelope = JSON.parse(called.structuredContent.result);
const receipt = envelope.structuredContent;
if (receipt?.status !== "OK" || !receipt.receipt_id || !receipt.trace?.trace_id) {
  throw new Error("Nexla did not return a governed receipt and trace.");
}

process.stdout.write([
  `Nexla MCP ${initialized.serverInfo.name} ${initialized.serverInfo.version} verified.`,
  `${listed.tools.length} governed tools exposed; called ${readTool.name}.`,
  `${receipt.data?.stats?.row_count ?? 0} context row(s), receipt and trace present.`,
  "",
].join("\n"));
