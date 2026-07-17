import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { leadDiscoveryQuery } from "./zero";

describe("leadDiscoveryQuery", () => {
  it("uses provider-supported categories before paying for discovery", () => {
    expect(leadDiscoveryQuery("Independent cafe")).toEqual({ category: "cafe" });
    expect(leadDiscoveryQuery("Auto glass repair")).toEqual({ category: "automotive" });
  });

  it("uses an OpenStreetMap tag for specialized local services", () => {
    expect(leadDiscoveryQuery("Landscape design")).toEqual({ tag: "craft=landscaper" });
  });
});
