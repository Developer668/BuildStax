"use server";

import { isInsForgeBackend } from "@/lib/backend";
import * as insforge from "./campaign-insforge";
import * as sqlite from "./campaign-sqlite";
import type { ActionState } from "./types";

export async function createCampaignAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.createCampaignAction(state, formData) : sqlite.createCampaignAction(state, formData);
}

export async function updateCampaignAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.updateCampaignAction(state, formData) : sqlite.updateCampaignAction(state, formData);
}

export async function createPitchVersionAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.createPitchVersionAction(state, formData) : sqlite.createPitchVersionAction(state, formData);
}

export async function generateAkashPitchAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.generateAkashPitchAction(state, formData) : sqlite.generateAkashPitchAction(state, formData);
}

export async function runSandboxDiscoveryAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.runSandboxDiscoveryAction(state, formData) : sqlite.runSandboxDiscoveryAction(state, formData);
}
