import "server-only";

import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { appMode } from "@/lib/utils";

export function getAdminIdentity() {
  return {
    email: (process.env.ADMIN_EMAIL ?? "operator@buildstax.local").toLowerCase(),
    passwordIsLocalDefault: !process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH,
  };
}

export function verifyAdminPassword(candidate: string) {
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  if (configuredHash) {
    const [scheme, salt, expectedHex] = configuredHash.split("$");
    if (scheme !== "scrypt" || !salt || !expectedHex) return false;
    const actual = scryptSync(candidate, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  if (appMode() === "production" && !process.env.ADMIN_PASSWORD) return false;
  const configured = process.env.ADMIN_PASSWORD ?? "buildstax-local";
  const actual = createHash("sha256").update(candidate).digest();
  const expected = createHash("sha256").update(configured).digest();
  return timingSafeEqual(actual, expected);
}

export function createPasswordHash(password: string, salt: string) {
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}
