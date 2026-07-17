import "server-only";

type Entry = { count: number; startedAt: number };
const store = new Map<string, Entry>();

export function consumeMemoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.startedAt >= windowMs) {
    store.set(key, { count: 1, startedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - entry.startedAt)) / 1000)) };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
