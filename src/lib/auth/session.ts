import "server-only";

import { redirect } from "next/navigation";
import { isInsForgeBackend } from "@/lib/backend";
import type { User } from "@/lib/db/schema";
import { getInsForgeContext } from "@/lib/insforge/context";
import * as local from "./local-session";

export { SESSION_COOKIE } from "./constants";

export async function getCurrentUser() {
  if (!isInsForgeBackend()) return local.getCurrentUser();
  return (await getInsForgeContext())?.user ?? null;
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
