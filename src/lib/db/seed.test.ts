import path from "node:path";
import Database from "better-sqlite3";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

const originalEnvironment = {
  APP_MODE: process.env.APP_MODE,
  SEED_SANDBOX_DATA: process.env.SEED_SANDBOX_DATA,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_NAME: process.env.ADMIN_NAME,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("production database bootstrap", () => {
  it("is idempotent while the workspace has no campaigns", () => {
    process.env.APP_MODE = "production";
    delete process.env.SEED_SANDBOX_DATA;
    process.env.ADMIN_EMAIL = "owner@example.test";
    process.env.ADMIN_NAME = "Test Owner";

    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

    seedDatabase(db);
    seedDatabase(db);

    expect(db.select({ value: count() }).from(schema.users).get()?.value).toBe(1);
    expect(db.select({ value: count() }).from(schema.settings).get()?.value).toBe(7);
    expect(db.select({ value: count() }).from(schema.campaigns).get()?.value).toBe(0);
    sqlite.close();
  });
});
