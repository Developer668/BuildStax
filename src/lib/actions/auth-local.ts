"use server";

import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminIdentity, verifyAdminPassword } from "@/lib/auth/password";
import { clearSession, getCurrentUser, SESSION_COOKIE, setSession } from "@/lib/auth/local-session";
import { getUserByEmail } from "@/lib/db/sqlite-queries";
import { consumeRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import type { ActionState } from "./types";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must contain at least 8 characters.").max(256),
});

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const values = loginSchema.safeParse(Object.fromEntries(formData));
  if (!values.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: z.flattenError(values.error).fieldErrors };
  }
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rateKey = `login:${ip}`;
  const limit = consumeRateLimit(rateKey, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { status: "error", message: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  }

  const identity = getAdminIdentity();
  if (values.data.email !== identity.email || !verifyAdminPassword(values.data.password)) {
    return { status: "error", message: "Email or password is incorrect." };
  }
  const user = await getUserByEmail(identity.email);
  if (!user) return { status: "error", message: "The configured operator account is not initialized." };
  resetRateLimit(rateKey);
  await setSession(user);
  return { status: "success", message: "Signed in.", redirectTo: "/dashboard" };
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function redirectAuthenticatedUser() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
}

export async function clearInvalidSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
