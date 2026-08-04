import { afterEach, describe, expect, it } from "vitest";
import { dataBackend } from "./backend";

const environmentKeys = ["APP_MODE", "DATA_BACKEND", "NEXT_PUBLIC_INSFORGE_URL", "NEXT_PUBLIC_INSFORGE_ANON_KEY"] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("data backend selection", () => {
  it("selects InsForge when public configuration is present without an explicit backend", () => {
    delete process.env.DATA_BACKEND;
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://workspace.insforge.app";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "anon-key";
    expect(dataBackend()).toBe("insforge");
  });

  it("rejects an explicitly selected InsForge backend without public configuration", () => {
    process.env.DATA_BACKEND = "insforge";
    delete process.env.NEXT_PUBLIC_INSFORGE_URL;
    delete process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
    expect(() => dataBackend()).toThrow("requires NEXT_PUBLIC_INSFORGE_URL");
  });

  it("keeps the SQLite fallback explicit in sandbox mode", () => {
    process.env.APP_MODE = "sandbox";
    process.env.DATA_BACKEND = "sqlite";
    expect(dataBackend()).toBe("sqlite");
  });

  it("fails closed when production has no configured backend", () => {
    process.env.APP_MODE = "production";
    delete process.env.DATA_BACKEND;
    delete process.env.NEXT_PUBLIC_INSFORGE_URL;
    delete process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
    expect(() => dataBackend()).toThrow("required in production");
  });
});
