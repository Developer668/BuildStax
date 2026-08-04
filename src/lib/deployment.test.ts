import { describe, expect, it } from "vitest";
import { deploymentUrlSchema, isSafeDeploymentUrl } from "./deployment";

describe("deployment URL evidence", () => {
  it("accepts HTTPS deployment origins and paths", () => {
    expect(deploymentUrlSchema.parse("https://customer.example.com/site")).toBe("https://customer.example.com/site");
    expect(isSafeDeploymentUrl("https://customer.example.com/site")).toBe(true);
  });

  it("rejects non-HTTPS deployment URLs", () => {
    expect(deploymentUrlSchema.safeParse("http://customer.example.com").success).toBe(false);
    expect(deploymentUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("rejects credentials and fragments", () => {
    expect(deploymentUrlSchema.safeParse("https://user:password@customer.example.com").success).toBe(false);
    expect(deploymentUrlSchema.safeParse("https://customer.example.com/#preview").success).toBe(false);
  });
});
