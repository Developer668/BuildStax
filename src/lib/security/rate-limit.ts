import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const db = getDb();
  const now = new Date();
  const existing = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
  if (!existing || now.getTime() - new Date(existing.windowStartedAt).getTime() >= windowMs) {
    db.insert(rateLimits)
      .values({ key, count: 1, windowStartedAt: now.toISOString() })
      .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, windowStartedAt: now.toISOString() } })
      .run();
    return { allowed: true, remaining: limit - 1 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now.getTime() - new Date(existing.windowStartedAt).getTime())) / 1000)),
    };
  }
  db.update(rateLimits).set({ count: existing.count + 1 }).where(eq(rateLimits.key, key)).run();
  return { allowed: true, remaining: limit - existing.count - 1 };
}

export function resetRateLimit(key: string) {
  getDb().delete(rateLimits).where(eq(rateLimits.key, key)).run();
}
