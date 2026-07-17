import { describe, expect, it } from "vitest";
import { getPreviewContent } from "./preview-content";

describe("getPreviewContent", () => {
  it("selects repair content for bicycle businesses", () => {
    const content = getPreviewContent("Bicycle repair", "Oakland");
    expect(content.image).toContain("bicycle");
    expect(content.services.map(([title]) => title)).toContain("Tune-ups");
    expect(content.kicker).toBe("Bicycle repair · Oakland");
  });

  it("does not fall back to grooming for unrelated services", () => {
    const content = getPreviewContent("Bookkeeping", "Berkeley");
    expect(content.image).toContain("bookkeeping");
    expect(content.intro).not.toMatch(/dog|groom/i);
  });

  it("uses the approved brief as bounded public copy", () => {
    const content = getPreviewContent("Bookkeeping", "Berkeley", {
      brief: ` Monthly reconciliation\u0000 with plain-language owner reports. ${"x".repeat(800)}`,
    });

    expect(content.projectCopy).toMatch(/^Monthly reconciliation with plain-language owner reports\./);
    expect(content.projectCopy).not.toContain("\u0000");
    expect(content.projectCopy).toHaveLength(700);
    expect(content.projectCopy.endsWith("…")).toBe(true);
  });

  it("maps preferred style through fixed visual themes without rendering it as CSS", () => {
    const content = getPreviewContent("Yoga studio", "Oakland", {
      preferredStyle: ["Warm and welcoming ] ", "bg-", "[", "url(", "java", "script:alert(1))", "]"].join(""),
    });

    expect(content.surface).toBe("bg-[#f7f2ec] text-[#211d19]");
    expect(content.approachSurface).toBe("bg-[#304239]");
    expect(JSON.stringify(content)).not.toContain("javascript:");
  });
});
