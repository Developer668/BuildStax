import "server-only";

import { cache } from "react";
import type { User } from "@/lib/db/schema";
import { createInsForgeAdminClient, createInsForgeServerClient } from "./client";

type Row = Record<string, unknown>;

function profileName(profile: unknown, email: string) {
  if (profile && typeof profile === "object" && "name" in profile && typeof profile.name === "string") {
    const name = profile.name.trim();
    if (name) return name;
  }
  return email.split("@")[0] || "BuildStax operator";
}

export const getInsForgeContext = cache(async () => {
  const client = await createInsForgeServerClient();
  const { data: authData, error: authError } = await client.auth.getCurrentUser();
  const authUser = authData?.user;
  if (authError || !authUser?.id || !authUser.email) return null;

  const name = profileName(authUser.profile, authUser.email);
  const { data: workspaceData, error: workspaceError } = await client.database.rpc("bootstrap_workspace", {
    p_name: "BuildStax Operations",
    p_email: authUser.email,
    p_display_name: name,
  });
  if (workspaceError || !workspaceData) {
    throw new Error("InsForge could not initialize the operator workspace.");
  }
  const workspaceId = Array.isArray(workspaceData) ? String(workspaceData[0] ?? "") : String(workspaceData);
  if (!workspaceId) throw new Error("InsForge returned an invalid workspace identifier.");

  const admin = createInsForgeAdminClient();
  const { data: memberData, error: memberError } = await client.database
    .from("workspace_members")
    .select("workspace_id, user_id, role, email, display_name, created_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (memberError || !memberData) throw new Error("The signed-in user has no BuildStax workspace membership.");
  const member = memberData as Row;
  const role = member.role === "owner" || member.role === "viewer" ? member.role : "operator";
  const user: User = {
    id: String(authUser.id),
    email: String(authUser.email).toLowerCase(),
    name: String(member.display_name ?? name),
    role,
    createdAt: String(member.created_at ?? authUser.createdAt ?? new Date().toISOString()),
  };

  return { client, admin, workspaceId, user };
});

export async function requireInsForgeContext() {
  const context = await getInsForgeContext();
  if (!context) throw new Error("Authentication required.");
  return context;
}
