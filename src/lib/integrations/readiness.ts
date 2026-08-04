import "server-only";

import { getAkashMLReadiness } from "./akashml";
import { getNexlaReadiness } from "./nexla";
import { getPomeriumReadiness } from "./pomerium";
import { getPlivoReadiness } from "./plivo";
import { getStripeReadiness } from "./stripe";
import { getZeroReadiness } from "@/lib/providers/zero";

const READINESS_TIMEOUT_MS = 2_500;

function boundedReadiness<T extends { detail: string }>(promise: Promise<T>, fallback: T) {
  return new Promise<T>((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), READINESS_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        resolve(fallback);
      },
    );
  });
}

export async function getExternalIntegrationReadiness() {
  const [zero, nexla, akashml, pomerium, stripe, plivo] = await Promise.all([
    boundedReadiness(getZeroReadiness(), { runner: "missing", authenticated: false, liveActionsEnabled: false, detail: "Zero readiness check timed out before a provider result was available." }),
    boundedReadiness(getNexlaReadiness(), { status: "partial", detail: "Nexla readiness check timed out before a provider result was available." }),
    boundedReadiness(getAkashMLReadiness(), { status: "partial", detail: "AkashML readiness check timed out before a provider result was available.", model: "", modelCount: 0 }),
    boundedReadiness(getPomeriumReadiness(), { status: "partial", detail: "Pomerium readiness check timed out before a provider result was available.", deployment: "Pomerium Zero" }),
    boundedReadiness(getStripeReadiness(), { status: "partial", detail: "Stripe readiness check timed out before a provider result was available." }),
    boundedReadiness(getPlivoReadiness(), { status: "partial", detail: "Plivo readiness check timed out before a provider result was available." }),
  ]);
  return {
    zero: {
      status: zero.authenticated && zero.liveActionsEnabled ? "ready" as const : zero.runner === "available" ? "partial" as const : "missing" as const,
      detail: zero.detail,
      metadata: zero,
    },
    nexla: { ...nexla, metadata: nexla },
    akashml: { ...akashml, metadata: akashml },
    pomerium: { ...pomerium, metadata: pomerium },
    stripe: { ...stripe, metadata: stripe },
    plivo: { ...plivo, metadata: plivo },
  };
}
