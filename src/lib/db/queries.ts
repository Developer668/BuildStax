import "server-only";

import { isInsForgeBackend } from "@/lib/backend";
import * as insforge from "@/lib/insforge/queries";
import * as sqlite from "./sqlite-queries";

export const getUserByEmail = sqlite.getUserByEmail;
export const getUserById = sqlite.getUserById;

export function getWorkspaceSettings() {
  return isInsForgeBackend() ? insforge.getWorkspaceSettings() : sqlite.getWorkspaceSettings();
}

export function getDashboardData() {
  return isInsForgeBackend() ? insforge.getDashboardData() : sqlite.getDashboardData();
}

export function listBusinesses(filters?: { search?: string; stage?: string; campaignId?: string }) {
  return isInsForgeBackend() ? insforge.listBusinesses(filters) : sqlite.listBusinesses(filters);
}

export function getBusinessDetail(id: string) {
  return isInsForgeBackend() ? insforge.getBusinessDetail(id) : sqlite.getBusinessDetail(id);
}

export function listCampaigns() {
  return isInsForgeBackend() ? insforge.listCampaigns() : sqlite.listCampaigns();
}

export function listCampaignOptions() {
  return isInsForgeBackend() ? insforge.listCampaignOptions() : sqlite.listCampaignOptions();
}

export function listAutomationRuns(filters?: { status?: string; type?: string }) {
  return isInsForgeBackend() ? insforge.listAutomationRuns(filters) : sqlite.listAutomationRuns(filters);
}

export function listDeliveryProjects() {
  return isInsForgeBackend() ? insforge.listDeliveryProjects() : sqlite.listDeliveryProjects();
}

export function getPreviewByToken(token: string) {
  return isInsForgeBackend() ? insforge.getPreviewByToken(token) : sqlite.getPreviewByToken(token);
}

export function getDatabaseHealth() {
  return isInsForgeBackend() ? insforge.getDatabaseHealth() : sqlite.getDatabaseHealth();
}
