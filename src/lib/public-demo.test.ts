import { describe, expect, it } from "vitest";
import { BUILDSTAX_DEMO_PHONE, resolveBuildStaxDemoPhone } from "./public-demo";

describe("public demo phone", () => {
  it("keeps the published number aligned with the inbound fallback", () => {
    expect(resolveBuildStaxDemoPhone(undefined)).toBe(BUILDSTAX_DEMO_PHONE);
    expect(resolveBuildStaxDemoPhone("not-a-phone-number")).toBe(BUILDSTAX_DEMO_PHONE);
    expect(resolveBuildStaxDemoPhone(" +14155550123 ")).toBe("+14155550123");
  });
});
