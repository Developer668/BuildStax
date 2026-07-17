import "server-only";

type PomeriumPolicy = {
  id: string;
  name: string;
  ppl?: unknown;
};

type PomeriumRoute = {
  id: string;
  name: string;
  from: string;
  to?: string | string[];
  policies?: Array<string | PomeriumPolicy>;
  policyIds?: string[];
};

const DEFAULT_API_URL = "https://console.pomerium.app/api/v0";

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw new Error(`${fallback} (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
  return false;
}

function hasNonemptyAllowPolicy(policy: PomeriumPolicy) {
  if (!isRecord(policy.ppl) || !("allow" in policy.ppl)) return false;
  return hasMeaningfulValue(policy.ppl.allow);
}

function normalizedUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function urlsMatch(actual: string, expected: string) {
  try {
    return normalizedUrl(actual) === normalizedUrl(expected);
  } catch {
    return false;
  }
}

async function getPomeriumManagementReadiness() {
  const apiUserToken = process.env.POMERIUM_ZERO_API_TOKEN;
  const organizationId = process.env.POMERIUM_ZERO_ORGANIZATION_ID;
  const namespaceId = process.env.POMERIUM_ZERO_NAMESPACE_ID;
  const expectedPolicyId = process.env.POMERIUM_ZERO_POLICY_ID;
  const expectedRouteId = process.env.POMERIUM_ZERO_ROUTE_ID;
  const expectedRouteUrl = process.env.POMERIUM_ZERO_ROUTE_URL;
  const expectedUpstreamUrl = process.env.POMERIUM_UPSTREAM_URL;
  if (!apiUserToken || !organizationId || !namespaceId || !expectedPolicyId || !expectedRouteId || !expectedRouteUrl || !expectedUpstreamUrl) {
    return {
      status: "partial" as const,
      detail: "The replica is configured, but its Pomerium Zero management or expected route configuration is incomplete.",
    };
  }

  try {
    const apiUrl = (process.env.POMERIUM_ZERO_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
    const exchange = await fetch(`${apiUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: apiUserToken }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const credentials = await responseJson<{ idToken?: string }>(exchange, "Pomerium rejected the API user token");
    if (!credentials.idToken) throw new Error("Pomerium returned an invalid token exchange response.");

    const query = new URLSearchParams({ namespaceId });
    const headers = { authorization: `Bearer ${credentials.idToken}` };
    const [policiesResponse, routesResponse] = await Promise.all([
      fetch(`${apiUrl}/organizations/${encodeURIComponent(organizationId)}/policies?${query}`, {
        headers,
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      }),
      fetch(`${apiUrl}/organizations/${encodeURIComponent(organizationId)}/routes?${query}`, {
        headers,
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      }),
    ]);
    const [policies, routes] = await Promise.all([
      responseJson<PomeriumPolicy[]>(policiesResponse, "Pomerium policy discovery failed"),
      responseJson<PomeriumRoute[]>(routesResponse, "Pomerium route discovery failed"),
    ]);
    const policy = policies.find((item) => item.id === expectedPolicyId);
    const route = routes.find((item) => item.id === expectedRouteId);
    if (!policy || !route) {
      return {
        status: "partial" as const,
        detail: "The Zero API is authenticated, but the configured BuildStax route or policy no longer exists.",
      };
    }
    if (!urlsMatch(route.from, expectedRouteUrl)) {
      return {
        status: "partial" as const,
        detail: "The BuildStax route exists, but its origin does not match the configured public URL.",
      };
    }
    const upstreams = Array.isArray(route.to) ? route.to : route.to ? [route.to] : [];
    if (!upstreams.some((upstream) => urlsMatch(upstream, expectedUpstreamUrl))) {
      return {
        status: "partial" as const,
        detail: "The BuildStax route exists, but its upstream does not match the configured application destination.",
      };
    }
    const attachedPolicyIds = [
      ...(route.policyIds ?? []),
      ...(route.policies ?? []).map((item) => (typeof item === "string" ? item : item.id)),
    ];
    if (!attachedPolicyIds.includes(policy.id)) {
      return {
        status: "partial" as const,
        detail: "The BuildStax route exists, but its operator policy is not attached.",
      };
    }
    if (!hasNonemptyAllowPolicy(policy)) {
      return {
        status: "partial" as const,
        detail: "The BuildStax operator policy is attached, but it has no nonempty PPL allow rule.",
      };
    }
    return {
      status: "ready" as const,
      detail: `The Zero API verified ${route.name}, its configured origin and upstream, and the nonempty ${policy.name} allow policy.`,
    };
  } catch (error) {
    return {
      status: "partial" as const,
      detail: error instanceof Error ? error.message : "The Pomerium Zero management API was not reachable.",
    };
  }
}

export async function getPomeriumReadiness() {
  if (!process.env.POMERIUM_CLUSTER_TOKEN) {
    return {
      status: "missing" as const,
      detail: "No Pomerium Zero cluster token is configured.",
      deployment: "Pomerium Zero",
    };
  }
  const healthUrl = process.env.POMERIUM_HEALTH_URL;
  if (!healthUrl) {
    return {
      status: "partial" as const,
      detail: "A Pomerium Zero cluster bootstrap token is present, but no replica health endpoint is configured. Routes and policies require a separate Zero API user token.",
      deployment: "Pomerium Zero",
    };
  }
  try {
    const [response, management] = await Promise.all([
      fetch(healthUrl, { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      getPomeriumManagementReadiness(),
    ]);
    if (!response.ok) {
      return {
        status: "partial" as const,
        detail: `The Pomerium Zero replica health endpoint returned HTTP ${response.status}.`,
        deployment: "Pomerium Zero",
      };
    }
    return {
      status: management.status,
      detail: management.status === "ready"
        ? `The Pomerium Zero replica is healthy. ${management.detail}`
        : management.detail,
      deployment: "Pomerium Zero",
    };
  } catch {
    return {
      status: "partial" as const,
      detail: "The Pomerium Zero replica health endpoint was not reachable.",
      deployment: "Pomerium Zero",
    };
  }
}
