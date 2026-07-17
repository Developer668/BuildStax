"use server";

import { isInsForgeBackend } from "@/lib/backend";
import * as insforge from "./business-insforge";
import * as sqlite from "./business-sqlite";
import type { ActionState } from "./types";

export async function createBusinessAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.createBusinessAction(state, formData) : sqlite.createBusinessAction(state, formData);
}

export async function updateBusinessStageAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.updateBusinessStageAction(state, formData) : sqlite.updateBusinessStageAction(state, formData);
}

export async function logCallAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.logCallAction(state, formData) : sqlite.logCallAction(state, formData);
}

export async function createQuoteAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.createQuoteAction(state, formData) : sqlite.createQuoteAction(state, formData);
}

export async function recordPaymentAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.recordPaymentAction(state, formData) : sqlite.recordPaymentAction(state, formData);
}

export async function createStripeCheckoutAction(state: ActionState, formData: FormData) {
  if (!isInsForgeBackend()) {
    return { status: "error" as const, message: "Stripe Checkout requires the InsForge backend." };
  }
  return insforge.createStripeCheckoutAction(state, formData);
}

export async function startBuildAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.startBuildAction(state, formData) : sqlite.startBuildAction(state, formData);
}

export async function advanceProjectAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.advanceProjectAction(state, formData) : sqlite.advanceProjectAction(state, formData);
}

export async function saveRequirementsAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.saveRequirementsAction(state, formData) : sqlite.saveRequirementsAction(state, formData);
}

export async function addMessageAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.addMessageAction(state, formData) : sqlite.addMessageAction(state, formData);
}

export async function submitPreviewFeedbackAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.submitPreviewFeedbackAction(state, formData) : sqlite.submitPreviewFeedbackAction(state, formData);
}
