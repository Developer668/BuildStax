"use server";

import { isInsForgeBackend } from "@/lib/backend";
import * as insforge from "./settings-insforge";
import * as sqlite from "./settings-sqlite";
import type { ActionState } from "./types";

export async function updateWorkspaceSettingsAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.updateWorkspaceSettingsAction(state, formData) : sqlite.updateWorkspaceSettingsAction(state, formData);
}

export async function auditIntegrationsAction(state: ActionState) {
  return isInsForgeBackend() ? insforge.auditIntegrationsAction(state) : sqlite.auditIntegrationsAction(state);
}
