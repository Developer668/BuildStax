import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPomeriumReadiness } from "./pomerium";

describe("getPomeriumReadiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubEnvironment() {
    vi.stubEnv("POMERIUM_CLUSTER_TOKEN", "cluster-token");
    vi.stubEnv("POMERIUM_HEALTH_URL", "http://127.0.0.1:28080");
    vi.stubEnv("POMERIUM_ZERO_API_URL", "https://console.pomerium.app/api/v0");
    vi.stubEnv("POMERIUM_ZERO_API_TOKEN", "api-user-token");
    vi.stubEnv("POMERIUM_ZERO_ORGANIZATION_ID", "organization-id");
    vi.stubEnv("POMERIUM_ZERO_NAMESPACE_ID", "namespace-id");
    vi.stubEnv("POMERIUM_ZERO_POLICY_ID", "policy-id");
    vi.stubEnv("POMERIUM_ZERO_ROUTE_ID", "route-id");
    vi.stubEnv("POMERIUM_ZERO_ROUTE_URL", "https://buildstax.example.com");
    vi.stubEnv("POMERIUM_UPSTREAM_URL", "http://host.docker.internal:3000");
  }

  function stubApi(fixture?: {
    policy?: Record<string, unknown>;
    route?: Record<string, unknown>;
  }) {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "http://127.0.0.1:28080") return new Response(null, { status: 200 });
      if (url.endsWith("/token")) return Response.json({ idToken: "id-token" });
      if (url.includes("/policies?")) {
        return Response.json([fixture?.policy ?? {
          id: "policy-id",
          name: "BuildStax Operator Access",
          ppl: { allow: { and: [{ email: { is: "operator@example.com" } }] } },
        }]);
      }
      if (url.includes("/routes?")) {
        return Response.json([fixture?.route ?? {
          id: "route-id",
          name: "BuildStax Operations",
          from: "https://buildstax.example.com",
          to: ["http://host.docker.internal:3000"],
          policies: [{ id: "policy-id", name: "BuildStax Operator Access" }],
        }]);
      }
      return new Response(null, { status: 404 });
    }));
  }

  it("verifies the configured route and nonempty allow policy returned by the Zero API", async () => {
    stubEnvironment();
    stubApi();

    await expect(getPomeriumReadiness()).resolves.toEqual({
      status: "ready",
      detail: "The Pomerium Zero replica is healthy. The Zero API verified BuildStax Operations, its configured origin and upstream, and the nonempty BuildStax Operator Access allow policy.",
      deployment: "Pomerium Zero",
    });
  });

  it("rejects an empty allow policy", async () => {
    stubEnvironment();
    stubApi({
      policy: {
        id: "policy-id",
        name: "BuildStax Operator Access",
        ppl: { allow: { and: [] } },
      },
    });

    await expect(getPomeriumReadiness()).resolves.toMatchObject({
      status: "partial",
      detail: "The BuildStax operator policy is attached, but it has no nonempty PPL allow rule.",
    });
  });

  it("rejects a route origin mismatch", async () => {
    stubEnvironment();
    stubApi({
      route: {
        id: "route-id",
        name: "BuildStax Operations",
        from: "https://other.example.com",
        to: ["http://host.docker.internal:3000"],
        policyIds: ["policy-id"],
      },
    });

    await expect(getPomeriumReadiness()).resolves.toMatchObject({
      status: "partial",
      detail: "The BuildStax route exists, but its origin does not match the configured public URL.",
    });
  });

  it("rejects a route upstream mismatch", async () => {
    stubEnvironment();
    stubApi({
      route: {
        id: "route-id",
        name: "BuildStax Operations",
        from: "https://buildstax.example.com",
        to: ["http://other.internal:3000"],
        policyIds: ["policy-id"],
      },
    });

    await expect(getPomeriumReadiness()).resolves.toMatchObject({
      status: "partial",
      detail: "The BuildStax route exists, but its upstream does not match the configured application destination.",
    });
  });
});
