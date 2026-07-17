import "server-only";

import { getAkashMLReadiness } from "./akashml";
import { getNexlaReadiness } from "./nexla";
import { getPomeriumReadiness } from "./pomerium";
import { getPlivoReadiness } from "./plivo";
import { getStripeReadiness } from "./stripe";
import { getZeroReadiness } from "@/lib/providers/zero";

export async function getExternalIntegrationReadiness() {
  const [zero, nexla, akashml, pomerium, stripe, plivo] = await Promise.all([
    getZeroReadiness(),
    getNexlaReadiness(),
    getAkashMLReadiness(),
    getPomeriumReadiness(),
    getStripeReadiness(),
    getPlivoReadiness(),
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
