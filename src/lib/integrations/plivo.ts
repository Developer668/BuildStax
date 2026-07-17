import "server-only";

import { Client, validateV3Signature } from "plivo";
import { z } from "zod";
import {
  buildPlivoStreamXml,
  createPlivoStreamToken,
  normalizeE164,
  plivoStreamUrl,
  publicRequestUrlCandidates,
} from "./plivo-protocol";
import { boundedCallSeconds, isPublicProviderHostname } from "./voice-protocol";

const configuredUrlSchema = z.string().url();

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function publicBaseUrl() {
  const value = env("PLIVO_PUBLIC_BASE_URL");
  if (!value) throw new Error("PLIVO_PUBLIC_BASE_URL is required before calls can be placed.");
  const parsed = new URL(configuredUrlSchema.parse(value));
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const local = ["127.0.0.1", "::1", "localhost"].includes(hostname);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("PLIVO_PUBLIC_BASE_URL must be an origin without credentials, a path, query, or fragment.");
  }
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:" && process.env.NODE_ENV !== "production")) {
    throw new Error("PLIVO_PUBLIC_BASE_URL must use HTTPS outside local development.");
  }
  if (!local && !isPublicProviderHostname(hostname)) throw new Error("PLIVO_PUBLIC_BASE_URL must use a public DNS hostname.");
  if (process.env.NODE_ENV === "production" && local) throw new Error("PLIVO_PUBLIC_BASE_URL must be public in production.");
  return parsed.origin;
}

export function plivoConfig() {
  const authId = env("PLIVO_AUTH_ID");
  const authToken = env("PLIVO_AUTH_TOKEN");
  const streamSecret = env("PLIVO_STREAM_SECRET");
  if (!authId || !authToken) throw new Error("Plivo account credentials are not configured.");
  if (streamSecret.length < 32) throw new Error("PLIVO_STREAM_SECRET must contain at least 32 characters.");
  return {
    authId,
    authToken,
    streamSecret,
    publicBaseUrl: publicBaseUrl(),
    primaryNumber: normalizeE164(env("PLIVO_PRIMARY_NUMBER")),
    testNumber: normalizeE164(env("PLIVO_TEST_NUMBER")),
    applicationId: env("PLIVO_APPLICATION_ID"),
    testDestination: env("PLIVO_TEST_DESTINATION") ? normalizeE164(env("PLIVO_TEST_DESTINATION")) : null,
    liveCallsEnabled: env("PLIVO_LIVE_CALLS_ENABLED") === "true",
    maxCallSeconds: boundedCallSeconds(env("PLIVO_MAX_CALL_SECONDS")),
  };
}

export function isPlivoCallConfigured() {
  try {
    const config = plivoConfig();
    const inferenceReady = Boolean(env("OPENAI_API_KEY") || env("VOICE_AGENT_API_KEY"));
    return inferenceReady && (process.env.APP_MODE === "production" ? config.liveCallsEnabled : Boolean(config.testDestination));
  } catch {
    return false;
  }
}

function apiUrl(path: string) {
  return new URL(path, `${plivoConfig().publicBaseUrl}/`).toString();
}

export function validatePlivoSignature(input: {
  method: string;
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  nonce: string | null;
  signature: string | null;
  params?: Record<string, string>;
  webSocket?: boolean;
}) {
  if (!input.nonce || !input.signature) return false;
  const config = plivoConfig();
  const signatures = input.signature.split(",").map((value) => value.trim()).filter(Boolean);
  const candidates = publicRequestUrlCandidates({
    requestUrl: input.requestUrl,
    forwardedHost: input.forwardedHost,
    forwardedProto: input.forwardedProto,
    configuredBaseUrl: config.publicBaseUrl,
    webSocket: input.webSocket,
  });
  return candidates.some((candidate) => signatures.some((signature) => Boolean(validateV3Signature(
    input.method.toUpperCase(),
    candidate,
    input.nonce as string,
    config.authToken,
    signature,
    input.params,
  ))));
}

export function createPlivoAnswer(input: {
  sessionId: string;
  callId: string;
  direction: "inbound" | "outbound";
}) {
  const config = plivoConfig();
  const token = createPlivoStreamToken(input, config.streamSecret);
  const streamUrl = plivoStreamUrl(config.publicBaseUrl, token);
  const statusUrl = apiUrl(`/api/telephony/plivo/events?sessionId=${encodeURIComponent(input.sessionId)}&kind=stream`);
  return buildPlivoStreamXml(streamUrl, statusUrl, input.sessionId);
}

export async function startPlivoCall(input: { sessionId: string; to: string; mode: "sandbox" | "live" }) {
  const config = plivoConfig();
  const destination = normalizeE164(input.to);
  if (input.mode === "sandbox") {
    if (!config.testDestination) throw new Error("PLIVO_TEST_DESTINATION is required for sandbox calls.");
    if (destination !== config.testDestination) throw new Error("Sandbox calls are restricted to PLIVO_TEST_DESTINATION.");
  } else if (!config.liveCallsEnabled) {
    throw new Error("Live Plivo calls are disabled.");
  }
  const from = input.mode === "sandbox" ? config.testNumber : config.primaryNumber;
  const answerUrl = apiUrl(`/api/telephony/plivo/answer?sessionId=${encodeURIComponent(input.sessionId)}`);
  const eventsUrl = apiUrl(`/api/telephony/plivo/events?sessionId=${encodeURIComponent(input.sessionId)}`);
  const client = new Client(config.authId, config.authToken, { timeout: 12_000 });
  const response = await client.calls.create(from.slice(1), destination.slice(1), answerUrl, {
    answerMethod: "POST",
    ringUrl: `${eventsUrl}&kind=ring`,
    ringMethod: "POST",
    hangupUrl: `${eventsUrl}&kind=hangup`,
    hangupMethod: "POST",
    fallbackAnswerUrl: `${eventsUrl}&kind=fallback`,
    fallbackMethod: "POST",
    ringTimeout: 35,
    timeLimit: config.maxCallSeconds,
  });
  const requestId = Array.isArray(response.requestUuid) ? response.requestUuid[0] : response.requestUuid;
  if (!requestId || !/^[A-Za-z0-9_-]{8,160}$/.test(String(requestId))) {
    throw new Error("Plivo accepted the request without returning a valid request identifier.");
  }
  return { requestId: String(requestId), from, to: destination };
}

export async function getPlivoReadiness() {
  const required = ["PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_TEST_NUMBER", "PLIVO_PRIMARY_NUMBER", "PLIVO_STREAM_SECRET"];
  if (required.some((key) => !env(key))) {
    return { status: "missing" as const, detail: "Plivo credentials, owned numbers, or the stream-signing secret are missing." };
  }
  if (!env("PLIVO_PUBLIC_BASE_URL")) {
    return { status: "partial" as const, detail: "Plivo credentials and numbers are configured, but no public HTTPS bridge URL is set." };
  }
  if (!env("OPENAI_API_KEY") && !env("VOICE_AGENT_API_KEY")) {
    return { status: "partial" as const, detail: "Plivo transport is configured, but no realtime voice inference credential is available." };
  }
  try {
    const config = plivoConfig();
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Number/?limit=20`, {
      headers: { authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Plivo account verification failed.");
    const body = await response.json() as { objects?: Array<{ number?: string; voice_enabled?: boolean; application?: string }> };
    const configured = new Set([config.testNumber.slice(1), config.primaryNumber.slice(1)]);
    const owned = (body.objects ?? []).filter((number) => number.voice_enabled && number.number && configured.has(number.number));
    if (owned.length !== configured.size) {
      return { status: "partial" as const, detail: "Plivo responded, but one or more configured caller IDs were not verified as voice-enabled." };
    }
    if (!/^\d{8,32}$/.test(config.applicationId)) {
      return { status: "partial" as const, detail: "The voice numbers exist, but the BuildStax inbound application ID is not configured." };
    }
    const primary = owned.find((number) => number.number === config.primaryNumber.slice(1));
    if (!primary?.application?.includes(`/Application/${config.applicationId}/`)) {
      return { status: "partial" as const, detail: "The primary voice number is not attached to the configured BuildStax application." };
    }
    const applicationResponse = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Application/${encodeURIComponent(config.applicationId)}/`, {
      headers: { authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!applicationResponse.ok) throw new Error("Plivo application verification failed.");
    const application = await applicationResponse.json() as { answer_url?: string; enabled?: boolean };
    const expectedAnswerUrl = apiUrl("/api/telephony/plivo/inbound");
    return application.enabled && application.answer_url === expectedAnswerUrl
      ? { status: "ready" as const, detail: `Plivo verified ${owned.length} voice-enabled caller IDs and the primary number's signed BuildStax inbound route.` }
      : { status: "partial" as const, detail: "The BuildStax Plivo application is disabled or its answer URL does not match the deployed inbound route." };
  } catch {
    return { status: "partial" as const, detail: "Plivo is configured, but live account and number readiness could not be verified." };
  }
}

export function safePlivoMessage(error: unknown) {
  if (!(error instanceof Error)) return "Plivo could not start the call.";
  if (/PLIVO_|sandbox|live Plivo|not configured|required|HTTPS|public DNS|origin|E\.164/i.test(error.message)) return error.message;
  if (/rate|429|too many/i.test(error.message)) return "Plivo rate-limited the request. Wait a moment and try again.";
  if (/balance|credit|402/i.test(error.message)) return "The Plivo account does not have enough credit for this call.";
  return "Plivo could not start the call. No completed call was recorded.";
}
