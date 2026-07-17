#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function parseEnv(file) {
  const result = {};
  let contents = "";
  try {
    contents = readFileSync(resolve(root, file), "utf8");
  } catch {
    return result;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function command(binary, args, env = process.env) {
  try {
    return execFileSync(binary, args, {
      cwd: root,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`${binary} could not complete the configuration step.`);
  }
}

function envLine(key, value) {
  if (typeof value !== "string" || !value) return null;
  if (/\r|\n/.test(value)) throw new Error(`${key} contains a line break.`);
  return `${key}=${value}`;
}

const sourceEnv = parseEnv(".env");
const base = { ...sourceEnv, ...parseEnv(".env.local") };
const project = JSON.parse(readFileSync(resolve(root, ".insforge/project.json"), "utf8"));
if (!project.oss_host) throw new Error("The linked InsForge project does not expose oss_host.");

const anonOutput = command("npx", ["@insforge/cli", "secrets", "get", "ANON_KEY"]);
const anonKey = [...anonOutput.matchAll(/[A-Za-z0-9_-]{40,}/g)]
  .map((match) => match[0])
  .sort((left, right) => right.length - left.length)[0];
if (!anonKey || anonKey.length < 32) throw new Error("InsForge returned an invalid ANON_KEY.");
const apiOutput = command("npx", ["@insforge/cli", "secrets", "get", "API_KEY"]);
const apiKey = apiOutput.trim().split(/\s*=\s*/).at(-1)?.trim();
if (!apiKey || apiKey.length < 20 || /\s/.test(apiKey)) throw new Error("InsForge returned an invalid API_KEY.");

const nexlaApiUrl = base.NEXLA_API_URL || "https://dev-api-express-code.nexla.com/";
const serviceKey = sourceEnv.NEXLA_SERVICE_KEY || sourceEnv.NEXLA_TOKEN || base.NEXLA_SERVICE_KEY;
if (!serviceKey) throw new Error("NEXLA_TOKEN or NEXLA_SERVICE_KEY is required in .env.");
const nexlaToken = command("nexla-cli", ["login", "--service-key", serviceKey, "--api-url", nexlaApiUrl]);
const nexlaEnv = { ...process.env, NEXLA_API_URL: nexlaApiUrl, NEXLA_TOKEN: nexlaToken };
const sourceId = base.NEXLA_SOURCE_ID;
const nexsetId = base.NEXLA_NEXSET_ID;
const toolsetId = base.NEXLA_TOOLSET_ID;
if (!sourceId || !nexsetId || !toolsetId) {
  throw new Error("NEXLA_SOURCE_ID, NEXLA_NEXSET_ID, and NEXLA_TOOLSET_ID are required.");
}
const source = JSON.parse(command("nexla-cli", ["sources", "get", sourceId, "--output", "json"], nexlaEnv));
const toolset = JSON.parse(command("nexla-cli", ["toolsets", "get", toolsetId, "--output", "json"], nexlaEnv));
const derived = JSON.parse(command("nexla-cli", ["nexsets", "get", nexsetId, "--output", "json"], nexlaEnv));
if (!source.hosted_url || !source.id || !derived.id || !toolset.id) {
  throw new Error("Provision the BuildStax Nexla source, derived Nexset, and toolset first.");
}

const values = {
  DATA_BACKEND: "insforge",
  APP_MODE: base.APP_MODE || "sandbox",
  NEXT_PUBLIC_INSFORGE_URL: project.oss_host,
  NEXT_PUBLIC_INSFORGE_ANON_KEY: anonKey,
  INSFORGE_API_KEY: apiKey,
  DATABASE_URL: base.DATABASE_URL || "file:./data/buildstax.db",
  AUTH_SECRET: base.AUTH_SECRET,
  ADMIN_EMAIL: base.ADMIN_EMAIL,
  ADMIN_NAME: base.ADMIN_NAME,
  ADMIN_PASSWORD_HASH: base.ADMIN_PASSWORD_HASH,
  ZERO_RUNNER: base.ZERO_RUNNER || `${process.env.HOME}/.zero/runtime/bin/zero`,
  ZERO_LIVE_ACTIONS: base.ZERO_LIVE_ACTIONS || "false",
  NEXLA_API_URL: nexlaApiUrl,
  NEXLA_SERVICE_KEY: serviceKey,
  NEXLA_TOKEN: nexlaToken,
  NEXLA_INGEST_URL: source.hosted_url,
  NEXLA_SOURCE_ID: String(source.id),
  NEXLA_NEXSET_ID: String(derived.id),
  NEXLA_TOOLSET_ID: String(toolset.id),
  NEXLA_MONITORING_URL: base.NEXLA_MONITORING_URL || "https://veda-ai.nexla.io/monitoring/",
  AKASHML_API_KEY: base.AKASHML_API_KEY,
  AKASHML_MODEL: base.AKASHML_MODEL || "deepseek-ai/DeepSeek-V4-Flash",
  OPENAI_API_KEY: base.OPENAI_API_KEY,
  APP_URL: base.APP_URL || "http://127.0.0.1:3000",
  STRIPE_ENVIRONMENT: base.STRIPE_ENVIRONMENT || "test",
  STRIPE_SECRET_KEY: base.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: base.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_PRODUCT_ID: base.STRIPE_PRODUCT_ID,
  STRIPE_WEBHOOK_ENDPOINT_ID: base.STRIPE_WEBHOOK_ENDPOINT_ID,
  POMERIUM_CLUSTER_TOKEN: base.POMERIUM_CLUSTER_TOKEN,
  POMERIUM_HEALTH_URL: base.POMERIUM_HEALTH_URL || "http://127.0.0.1:28080/readyz",
  POMERIUM_ZERO_API_URL: base.POMERIUM_ZERO_API_URL || "https://console.pomerium.app/api/v0",
  POMERIUM_ZERO_API_TOKEN: base.POMERIUM_ZERO_API_TOKEN,
  POMERIUM_ZERO_ORGANIZATION_ID: base.POMERIUM_ZERO_ORGANIZATION_ID,
  POMERIUM_ZERO_NAMESPACE_ID: base.POMERIUM_ZERO_NAMESPACE_ID,
  POMERIUM_ZERO_POLICY_ID: base.POMERIUM_ZERO_POLICY_ID,
  POMERIUM_ZERO_ROUTE_ID: base.POMERIUM_ZERO_ROUTE_ID,
  POMERIUM_ZERO_ROUTE_URL: base.POMERIUM_ZERO_ROUTE_URL,
  POMERIUM_UPSTREAM_URL: base.POMERIUM_UPSTREAM_URL || "http://host.docker.internal:3000",
};

const lines = [
  "# Generated by scripts/configure-linked-backends.mjs. Never commit this file.",
  ...Object.entries(values).map(([key, value]) => envLine(key, value)).filter(Boolean),
  "",
];
const destination = resolve(root, ".env.local");
writeFileSync(destination, lines.join("\n"), { mode: 0o600 });
chmodSync(destination, 0o600);
process.stdout.write(`Configured .env.local (${Object.keys(values).filter((key) => values[key]).join(", ")}).\n`);
