import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Business, Project } from "@/lib/db/schema";

vi.mock("server-only", () => ({}));

import { buildArtifactSourceHash, createBuildArtifact, isBuildArtifactCurrent, readBuildArtifact, readBuildArtifactSummary } from "./artifact";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("createBuildArtifact", () => {
  it("creates a verified static site without executing customer-provided content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "buildstax-artifact-"));
    roots.push(root);
    const artifactBusiness: Business = {
      id: "biz_test", campaignId: null, name: "Harbor Repair <script>", category: "Bicycle repair", location: "Oakland", address: "", contactName: "", phone: "+1 510 555 0101", email: "", websiteStatus: "none", source: "manual", sourceRef: "", stage: "building", score: 80, doNotCall: false, estimatedSiteCostCents: 90000, requirements: "Reliable repairs and same-day updates.", preferredStyle: "Calm and practical", nextAction: "", nextActionAt: null, lastContactAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const artifactProject: Project = { id: "prj_test_build", businessId: "biz_test", status: "building", brief: "Reliable repairs and same-day updates.", previewToken: "preview-test", productionUrl: null, revisionCount: 0, deliveredAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    const artifact = await createBuildArtifact({
      root,
      business: artifactBusiness,
      project: artifactProject,
    });

    expect(artifact.qa.passed).toBe(true);
    expect(artifact.revisionCount).toBe(0);
    expect(artifact.sourceHash).toBe(buildArtifactSourceHash({
      business: artifactBusiness,
      project: artifactProject,
    }));
    expect(artifact.html).toContain("Harbor Repair &lt;script&gt;");
    expect(artifact.html).toContain('<img src="/images/cypress-bicycle-repair.png"');
    expect(artifact.html).not.toContain("<script>");
    expect(artifact.qa.checks.find((check) => check.name === "contextual-image")?.passed).toBe(true);
    expect((await readBuildArtifact("prj_test_build", root))?.sha256).toBe(artifact.sha256);
    const summary = await readBuildArtifactSummary("prj_test_build", root);
    expect(summary?.sha256).toBe(artifact.sha256);
    expect(summary).not.toHaveProperty("html");
    expect(isBuildArtifactCurrent(summary, artifactProject, artifactBusiness)).toBe(true);
    expect(isBuildArtifactCurrent(summary, { ...artifactProject, brief: "Updated brief" }, artifactBusiness)).toBe(false);
  });
});
