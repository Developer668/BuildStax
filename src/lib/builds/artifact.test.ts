import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createBuildArtifact, readBuildArtifact } from "./artifact";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("createBuildArtifact", () => {
  it("creates a verified static site without executing customer-provided content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "buildstax-artifact-"));
    roots.push(root);
    const artifact = await createBuildArtifact({
      root,
      business: {
        id: "biz_test", campaignId: null, name: "Harbor Repair <script>", category: "Bicycle repair", location: "Oakland", address: "", contactName: "", phone: "+1 510 555 0101", email: "", websiteStatus: "none", source: "manual", sourceRef: "", stage: "building", score: 80, doNotCall: false, estimatedSiteCostCents: 90000, requirements: "Reliable repairs and same-day updates.", preferredStyle: "Calm and practical", nextAction: "", nextActionAt: null, lastContactAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
      project: { id: "prj_test_build", businessId: "biz_test", status: "building", brief: "Reliable repairs and same-day updates.", previewToken: "preview-test", productionUrl: null, revisionCount: 0, deliveredAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    expect(artifact.qa.passed).toBe(true);
    expect(artifact.html).toContain("Harbor Repair &lt;script&gt;");
    expect(artifact.html).not.toContain("<script>");
    expect((await readBuildArtifact("prj_test_build", root))?.sha256).toBe(artifact.sha256);
  });
});
