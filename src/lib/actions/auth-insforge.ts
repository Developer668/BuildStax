"use server";

import { createAuthActions } from "@insforge/sdk/ssr";
import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createInsForgeAdminClient, safeInsForgeMessage } from "@/lib/insforge/client";
import type { ActionState } from "./types";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must contain at least 8 characters.").max(256),
});

type RateLimitResult = { allowed?: boolean; retryAfterSeconds?: number };

async function consumeAuthBucket(key: string, limit: number) {
  const admin = createInsForgeAdminClient();
  const result = await admin.database.rpc("consume_buildstax_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 15 * 60,
  });
  if (result.error) throw result.error;
  const value = result.data as RateLimitResult | null;
  return {
    allowed: value?.allowed === true,
    retryAfterSeconds: Math.max(1, Number(value?.retryAfterSeconds ?? 60)),
  };
}

async function authRateLimit(kind: string, email: string) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  const ip = requestHeaders.get("x-real-ip")?.trim() || forwarded?.at(-1) || "local";
  const secret = process.env.AUTH_RATE_LIMIT_SECRET || process.env.INSFORGE_API_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("A server-side rate-limit secret is required.");
  const digest = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  const [identity, network] = await Promise.all([
    consumeAuthBucket(`auth:identity:${digest(`${kind}:${email}`)}`, 8),
    consumeAuthBucket(`auth:network:${digest(`${kind}:${ip}`)}`, 30),
  ]);
  return {
    allowed: identity.allowed && network.allowed,
    retryAfterSeconds: Math.max(identity.retryAfterSeconds, network.retryAfterSeconds),
  };
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const limit = await authRateLimit("login", parsed.data.email);
  if (!limit.allowed) return { status: "error", message: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.signInWithPassword(parsed.data);
  if (error || !data?.user) {
    return { status: "error", message: safeInsForgeMessage(error, "Email or password is incorrect.") };
  }
  return { status: "success", message: "Signed in.", redirectTo: "/dashboard" };
}

const signUpSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  password: z.string().min(10, "Use at least 10 characters.").max(256),
});

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const limit = await authRateLimit("signup", parsed.data.email);
  if (!limit.allowed) return { status: "error", message: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.signUp(parsed.data);
  if (error || !data) return { status: "error", message: safeInsForgeMessage(error, "Account creation failed. Try again.") };
  if (data.requireEmailVerification) {
    return {
      status: "success",
      message: "Account created. Enter the six-digit code sent to your email.",
      redirectTo: `/verify?email=${encodeURIComponent(parsed.data.email)}`,
    };
  }
  return { status: "success", message: "Account created.", redirectTo: "/dashboard" };
}

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code."),
});

export async function verifyEmailAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = verifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Check the verification code.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const limit = await authRateLimit("verify", parsed.data.email);
  if (!limit.allowed) return { status: "error", message: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  const auth = createAuthActions({ cookies: await cookies() });
  const { data, error } = await auth.verifyEmail(parsed.data);
  if (error || !data?.user) return { status: "error", message: safeInsForgeMessage(error, "The code is invalid or expired.") };
  return { status: "success", message: "Email verified.", redirectTo: "/dashboard" };
}

export async function logoutAction() {
  const auth = createAuthActions({ cookies: await cookies() });
  await auth.signOut();
  redirect("/login");
}

export async function redirectAuthenticatedUser() {
  if (await getCurrentUser()) redirect("/dashboard");
}

export async function clearInvalidSession() {
  const auth = createAuthActions({ cookies: await cookies() });
  await auth.signOut();
}
