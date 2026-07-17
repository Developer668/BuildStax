"use server";

import { isInsForgeBackend } from "@/lib/backend";
import * as insforge from "./auth-insforge";
import * as local from "./auth-local";
import type { ActionState } from "./types";

export async function loginAction(state: ActionState, formData: FormData) {
  return isInsForgeBackend() ? insforge.loginAction(state, formData) : local.loginAction(state, formData);
}

export async function signUpAction(state: ActionState, formData: FormData) {
  if (!isInsForgeBackend()) return { status: "error", message: "Account creation is available with InsForge." } as ActionState;
  return insforge.signUpAction(state, formData);
}

export async function testLoginAction(state: ActionState) {
  if (!isInsForgeBackend()) return { status: "error", message: "Test login is unavailable." } as ActionState;
  return insforge.testLoginAction(state);
}

export async function verifyEmailAction(state: ActionState, formData: FormData) {
  if (!isInsForgeBackend()) return { status: "error", message: "Email verification is available with InsForge." } as ActionState;
  return insforge.verifyEmailAction(state, formData);
}

export async function logoutAction() {
  return isInsForgeBackend() ? insforge.logoutAction() : local.logoutAction();
}

export async function redirectAuthenticatedUser() {
  return isInsForgeBackend() ? insforge.redirectAuthenticatedUser() : local.redirectAuthenticatedUser();
}

export async function clearInvalidSession() {
  return isInsForgeBackend() ? insforge.clearInvalidSession() : local.clearInvalidSession();
}
