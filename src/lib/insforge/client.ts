import "server-only";

import { createAdminClient, createClient } from "@insforge/sdk";
import { createServerClient } from "@insforge/sdk/ssr";
import { cookies } from "next/headers";

export { safeInsForgeMessage } from "./errors";

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
