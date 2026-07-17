import { describe, expect, it } from "vitest";
import { capabilityPolicies } from "./catalog";

describe("Zero capability policies", () => {
  it("gives every intent an explicit bounded spend cap", () => {
    for (const policy of Object.values(capabilityPolicies)) {
      expect(policy.maxPayUsd).toBeGreaterThan(0);
      expect(policy.maxPayUsd).toBeLessThanOrEqual(2.1);
      expect(policy.searchQuery.length).toBeGreaterThan(20);
      expect(policy.requiredAvailability).toBe("healthy");
    }
  });

  it("does not pin transient marketplace tokens or endpoints", () => {
    const serialized = JSON.stringify(capabilityPolicies);
    expect(serialized).not.toContain("z_");
    expect(serialized).not.toContain("https://");
  });
});
