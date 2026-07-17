import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db/sqlite-queries";
import type { User } from "@/lib/db/schema";
import { appMode } from "@/lib/utils";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE } from "./constants";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  userId: string;
  email: string;
  role: User["role"];
  exp: number;
};

function authSecret() {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    if (appMode() === "production" && configured.length < 32) {
      throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
    }
    return configured;
  }
  if (appMode() === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }
  return "buildstax-local-only-session-secret-do-not-deploy";
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: User) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || !payload.email || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSession(user: User) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await getUserById(payload.userId);
  if (!user || user.email !== payload.email || user.role !== payload.role) return null;
  return user;
}

export async function requireUser(roles: Array<User["role"]> = ["owner", "operator", "viewer"]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect("/denied");
  return user;
}

export async function requireMutationUser() {
  return requireUser(["owner", "operator"]);
}
