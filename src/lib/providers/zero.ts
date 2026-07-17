import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { capabilityPolicies, type CapabilityIntent } from "./catalog";

const execFileAsync = promisify(execFile);

type ZeroCapability = {
  token: string;
  canonicalName: string;
  url: string;
  method: "GET" | "POST";
  availabilityStatus: string;
  cost?: { amount: string; asset: string };
  rating?: { successRate?: string };
  bodySchema?: unknown;
};

type ZeroSearchResponse = { capabilities: ZeroCapability[] };

export type ZeroReadiness = {
  runner: "available" | "missing";
  authenticated: boolean;
  liveActionsEnabled: boolean;
  detail: string;
};

function runner() {
  if (process.env.ZERO_RUNNER) return process.env.ZERO_RUNNER;
  const provisioned = join(homedir(), ".zero", "runtime", "bin", "zero");
  return existsSync(provisioned) ? provisioned : "zero";
}

async function execute(args: string[], timeout = 30_000) {
  const result = await execFileAsync(runner(), args, {
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  });
  return result.stdout.trim();
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} returned an invalid JSON response.`);
  }
}

export async function getZeroReadiness(): Promise<ZeroReadiness> {
  try {
    let raw: string;
    try {
      raw = await execute(["auth", "whoami", "--json"], 5_000);
    } catch (error) {
      const stdout = error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
        ? error.stdout.trim()
        : "";
      if (!stdout) throw error;
      raw = stdout;
    }
    const identity = parseJson<{ authMethod?: string; user?: { id?: string }; walletAddress?: string }>(raw, "Zero authentication check");
    const authenticated = Boolean(
      identity.user?.id || identity.walletAddress || (identity.authMethod && identity.authMethod !== "none"),
    );
    return {
      runner: "available",
      authenticated,
      liveActionsEnabled: process.env.ZERO_LIVE_ACTIONS === "true",
      detail: authenticated ? "Runner identity detected; no paid call has been made." : "Runner found, but no authenticated identity is available.",
    };
  } catch {
    return {
      runner: "missing",
      authenticated: false,
      liveActionsEnabled: false,
      detail: "The Zero runner could not be executed from the application process.",
    };
  }
}

export async function selectCapability(intent: CapabilityIntent) {
  const policy = capabilityPolicies[intent];
  const raw = await execute(["search", policy.searchQuery, "--json"]);
  const search = parseJson<ZeroSearchResponse>(raw, "Zero capability search");
  const candidates = search.capabilities.filter((candidate) => {
    const amount = Number(candidate.cost?.amount ?? Number.POSITIVE_INFINITY);
    const successRate = Number(candidate.rating?.successRate ?? 0);
    return (
      candidate.availabilityStatus === policy.requiredAvailability &&
      amount <= policy.maxPayUsd &&
      (!policy.minimumSuccessRate || successRate >= policy.minimumSuccessRate)
    );
  });
  const selected = [...candidates].sort((a, b) => {
    const aPreference = policy.preferredCanonicalNames.indexOf(a.canonicalName);
    const bPreference = policy.preferredCanonicalNames.indexOf(b.canonicalName);
    const aRank = aPreference === -1 ? Number.POSITIVE_INFINITY : aPreference;
    const bRank = bPreference === -1 ? Number.POSITIVE_INFINITY : bPreference;
    return aRank - bRank || Number(a.cost?.amount ?? 999) - Number(b.cost?.amount ?? 999);
  })[0];
  if (!selected) throw new Error(`No healthy Zero capability met the ${policy.label} policy.`);

  const detailRaw = await execute(["get", selected.token]);
  const detail = parseJson<Partial<ZeroCapability>>(detailRaw, "Zero capability inspection");
  if (!detail.bodySchema) throw new Error(`The selected ${policy.label} capability did not expose a request schema.`);
  return {
    policy,
    capability: {
      ...selected,
      ...detail,
      token: selected.token,
      canonicalName: selected.canonicalName,
      cost: selected.cost,
    } as ZeroCapability,
  };
}

export async function runJsonCapability(input: {
  intent: CapabilityIntent;
  query?: Record<string, string | number>;
  body?: unknown;
  validateResult?: (body: unknown) => boolean;
}) {
  if (process.env.ZERO_LIVE_ACTIONS !== "true") {
    throw new Error("Live Zero actions are disabled by ZERO_LIVE_ACTIONS.");
  }
  const { policy, capability } = await selectCapability(input.intent);
  const requestUrl = new URL(capability.url);
  const queryEntries = Object.entries(input.query ?? {});
  if (queryEntries.length > 12) throw new Error("Capability query exceeds the BuildStax safety limit.");
  for (const [key, rawValue] of queryEntries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) throw new Error("Capability query contains an invalid field.");
    const value = String(rawValue).trim();
    if (!value || value.length > 200) throw new Error("Capability query contains an invalid value.");
    requestUrl.searchParams.set(key, value);
  }
  const args = [
    "fetch",
    "--json",
    "--capability",
    capability.token,
    "--max-pay",
    policy.maxPayUsd.toFixed(4),
    "--timeout",
    "60",
    "--method",
    capability.method,
    requestUrl.toString(),
  ];
  if (capability.method === "POST") {
    const body = JSON.stringify(input.body ?? {});
    if (Buffer.byteLength(body) > 512_000) throw new Error("Capability payload exceeds the BuildStax safety limit.");
    args.push("-d", body);
  }
  const raw = await execute(args, 90_000);
  const result = parseJson<{ runId?: string; ok: boolean; body?: unknown; bodyRaw?: string }>(raw, "Zero capability call");
  const responseBody = result.body ?? result.bodyRaw;
  const valid = result.ok && (input.validateResult?.(responseBody) ?? true);
  if (result.runId) {
    await execute([
      "review",
      result.runId,
      valid ? "--success" : "--no-success",
      "--accuracy",
      valid ? "4" : "1",
      "--value",
      valid ? "4" : "1",
      "--reliability",
      valid ? "4" : "1",
      "--content",
      valid
        ? `${policy.label} run returned schema-valid data through the BuildStax policy wrapper.`
        : `${policy.label} run did not return usable data for the BuildStax workflow.`,
    ]);
  }
  if (!valid) throw new Error(`${policy.label} provider returned unusable data.`);
  return {
    body: responseBody,
    runId: result.runId ?? null,
    provider: capability.canonicalName,
    costCents: Math.round(Number(capability.cost?.amount ?? 0) * 100),
  };
}

const zeroProspectResponseSchema = z.object({
  results: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(1).max(120).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    website: z.string().trim().max(500).nullable().optional(),
  }).passthrough()).max(100),
}).passthrough();

export type ZeroProspect = {
  name: string;
  category: string;
  location: string;
  address: string;
  phone: string;
  sourceRef: string;
};

export async function discoverProspectsWithZero(input: { category: string; area: string; count: number }) {
  const count = Math.max(1, Math.min(Math.trunc(input.count), 25));
  const hasUsableProspect = (body: unknown) => {
    const parsed = zeroProspectResponseSchema.safeParse(body);
    return parsed.success && parsed.data.results.some((row) => !row.website?.trim() && (row.phone?.trim().length ?? 0) >= 7);
  };
  const result = await runJsonCapability({
    intent: "lead_discovery",
    query: { area: input.area.trim(), category: input.category.trim(), count },
    validateResult: hasUsableProspect,
  });
  const parsed = zeroProspectResponseSchema.parse(result.body);
  const seen = new Set<string>();
  const prospects: ZeroProspect[] = [];
  for (const row of parsed.results) {
    const phone = row.phone?.trim() ?? "";
    if (row.website?.trim() || phone.length < 7) continue;
    const key = `${row.name.toLowerCase()}|${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prospects.push({
      name: row.name,
      category: row.category?.replaceAll(":", " / ") || input.category,
      location: input.area,
      address: row.address ?? "",
      phone,
      sourceRef: `Zero ${result.provider} run ${result.runId ?? "unavailable"}`,
    });
    if (prospects.length >= count) break;
  }
  return { ...result, prospects };
}
