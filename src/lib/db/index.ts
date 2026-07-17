import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

type BuildStaxDb = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as {
  buildStaxSqlite?: Database.Database;
  buildStaxDb?: BuildStaxDb;
  buildStaxDbReady?: boolean;
};

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./data/buildstax.db";
  if (databaseUrl === ":memory:" || databaseUrl === "file::memory:") return ":memory:";
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("BuildStax currently requires a file: SQLite DATABASE_URL.");
  }
  const requestedPath = databaseUrl.slice("file:".length).replaceAll("\\", "/");
  const databaseName = requestedPath.startsWith("./data/")
    ? requestedPath.slice("./data/".length)
    : requestedPath.startsWith("data/")
      ? requestedPath.slice("data/".length)
      : "";
  if (!databaseName || databaseName.includes("\0")) {
    throw new Error("DATABASE_URL must point to a SQLite file inside the data directory.");
  }
  const dataDirectory = path.join(process.cwd(), "data");
  const filename = path.join(process.cwd(), "data", databaseName);
  const relativePath = path.relative(dataDirectory, filename);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("DATABASE_URL cannot leave the BuildStax data directory.");
  }
  return filename;
}

export function getSqlite() {
  if (!globalForDb.buildStaxSqlite) {
    const filename = resolveDatabasePath();
    if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
    const sqlite = new Database(filename);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    globalForDb.buildStaxSqlite = sqlite;
  }
  return globalForDb.buildStaxSqlite;
}

export function getDb() {
  if (!globalForDb.buildStaxDb) {
    globalForDb.buildStaxDb = drizzle(getSqlite(), { schema });
  }
  if (!globalForDb.buildStaxDbReady) {
    migrate(globalForDb.buildStaxDb, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    seedDatabase(globalForDb.buildStaxDb);
    globalForDb.buildStaxDbReady = true;
  }
  return globalForDb.buildStaxDb;
}
