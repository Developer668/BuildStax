import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export function id(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function audit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
}) {
  getDb()
    .insert(auditEvents)
    .values({ id: id("aud"), createdAt: new Date().toISOString(), ...input })
    .run();
}

export function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

export function actionError(message: string, fieldErrors?: Record<string, string[]>) {
  return { status: "error" as const, message, fieldErrors };
}

export function actionSuccess(message: string, redirectTo?: string) {
  return { status: "success" as const, message, redirectTo };
}
