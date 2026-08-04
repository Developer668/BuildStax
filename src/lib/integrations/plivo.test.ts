import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { plivoConfig } = await import("./plivo");

const required = {
  PLIVO_AUTH_ID: "MA-test",
  PLIVO_AUTH_TOKEN: "token",
  PLIVO_STREAM_SECRET: "01234567890123456789012345678901",
  PLIVO_PUBLIC_BASE_URL: "http://127.0.0.1:3000",
  PLIVO_PRIMARY_NUMBER: "+14155550100",
  PLIVO_TEST_NUMBER: "+14155550101",
  NODE_ENV: "development",
  APP_MODE: "sandbox",
};

afterEach(() => vi.unstubAllEnvs());

describe("plivo public origin", () => {
  it("allows a local HTTP origin in the sandbox", () => {
    vi.stubEnv("NODE_ENV", required.NODE_ENV);
    vi.stubEnv("APP_MODE", required.APP_MODE);
    for (const [key, value] of Object.entries(required)) {
      if (key !== "NODE_ENV" && key !== "APP_MODE") vi.stubEnv(key, value);
    }

    expect(plivoConfig().publicBaseUrl).toBe("http://127.0.0.1:3000");
  });

  it("rejects a local HTTP origin whenever either production signal is set", () => {
    for (const productionSignal of ["NODE_ENV", "APP_MODE"] as const) {
      vi.stubEnv("NODE_ENV", required.NODE_ENV);
      vi.stubEnv("APP_MODE", required.APP_MODE);
      for (const [key, value] of Object.entries(required)) {
        if (key !== "NODE_ENV" && key !== "APP_MODE") vi.stubEnv(key, value);
      }
      vi.stubEnv(productionSignal, "production");

      expect(() => plivoConfig()).toThrow("PLIVO_PUBLIC_BASE_URL must use HTTPS outside local development.");
      vi.unstubAllEnvs();
    }
  });
});
