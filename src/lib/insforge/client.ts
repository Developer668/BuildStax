import "server-only";

import { createAdminClient, createClient } from "@insforge/sdk";
import { createServerClient } from "@insforge/sdk/ssr";
import { cookies } from "next/headers";

function publicConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_INSFORGE_URL and NEXT_PUBLIC_INSFORGE_ANON_KEY are required.");
  }
  return { baseUrl, anonKey };
}

export async function createInsForgeServerClient() {
  return createServerClient({ ...publicConfig(), cookies: await cookies() });
}

export function createInsForgePublicClient() {
  return createClient(publicConfig());
}

export function createInsForgeAdminClient() {
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!apiKey) throw new Error("INSFORGE_API_KEY is required for trusted server mutations.");
  return createAdminClient({ baseUrl: publicConfig().baseUrl, apiKey });
}

export function safeInsForgeMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  if (/rate|too many/i.test(message)) return "Too many requests. Wait a moment and try again.";
  if (/daily spend cap/i.test(message)) return "This campaign's daily automation spend cap has been reached.";
  if (/quote expired|after the quote expired/i.test(message)) return "This quote has expired. Create a new quote before collecting payment.";
  if (/do-not-call|outreach is blocked/i.test(message)) return "Outreach is permanently blocked for this business.";
  if (/not found/i.test(message)) return "The requested record was not found.";
  if (/permission|policy|row-level|unauthor/i.test(message)) return "You do not have permission to perform this operation.";
  if (/duplicate|unique/i.test(message)) return "That record already exists.";
  return fallback;
}
