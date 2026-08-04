import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const baseEnvironment = {
  NEXT_PUBLIC_INSFORGE_URL: "http://127.0.0.1:3000",
  INSFORGE_API_KEY: "server-key",
  NODE_ENV: "development",
  APP_MODE: "sandbox",
};

afterEach(() => vi.unstubAllEnvs());

describe("telephony persistence origin", () => {
  it("rejects a local HTTP InsForge origin in production APP_MODE", async () => {
    for (const productionSignal of ["NODE_ENV", "APP_MODE"] as const) {
      for (const [key, value] of Object.entries(baseEnvironment)) vi.stubEnv(key, value);
      vi.stubEnv(productionSignal, "production");

      const { createTelephonySession } = await import("./telephony-store");
      await expect(createTelephonySession({
        id: "tel_test",
        workspaceId: "workspace",
        businessId: "business",
        direction: "outbound",
        status: "requested",
        mode: "sandbox",
        fromNumber: "+14155550100",
        toNumber: "+14155550101",
      })).rejects.toThrow("InsForge telephony persistence requires a trusted HTTPS API origin.");
      vi.unstubAllEnvs();
    }
  });
});
