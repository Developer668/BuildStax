import { createHmac, timingSafeEqual } from "node:crypto";

const STREAM_TOKEN_VERSION = 1;
const DEFAULT_TOKEN_TTL_SECONDS = 180;
const MAX_CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN_TTL_SECONDS = 300;
const MAX_PLIVO_FORM_BYTES = 64 * 1024;
const SESSION_ID_PATTERN = /^tel_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALL_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;

export type PlivoStreamTokenPayload = {
  v: number;
  sessionId: string;
  callId: string;
  direction: "inbound" | "outbound";
  iat: number;
  exp: number;
  nonce: string;
};

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function compactSessionId(sessionId: string) {
  return sessionId.slice(4).replaceAll("-", "").toLowerCase();
}

function expandSessionId(value: string) {
  if (!/^[0-9a-f]{32}$/.test(value)) return "";
  return `tel_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function base36Integer(value: string) {
  if (!/^[0-9a-z]{1,10}$/.test(value)) return Number.NaN;
  return Number.parseInt(value, 36);
}

export function createPlivoStreamToken(
  input: Pick<PlivoStreamTokenPayload, "sessionId" | "callId" | "direction">,
  secret: string,
  now = Date.now(),
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
) {
  if (secret.length < 32) throw new Error("PLIVO_STREAM_SECRET must contain at least 32 characters.");
  if (!SESSION_ID_PATTERN.test(input.sessionId) || !CALL_ID_PATTERN.test(input.callId)) {
    throw new Error("The Plivo stream identity is invalid.");
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > MAX_TOKEN_TTL_SECONDS) {
    throw new Error("The Plivo stream token lifetime is invalid.");
  }
  const issuedAt = Math.floor(now / 1000);
  const unsigned = [
    STREAM_TOKEN_VERSION.toString(36),
    compactSessionId(input.sessionId),
    Buffer.from(input.callId, "utf8").toString("base64url"),
    input.direction === "inbound" ? "i" : "o",
    issuedAt.toString(36),
    (issuedAt + ttlSeconds).toString(36),
  ].join(".");
  return `${unsigned}.${hmac(unsigned, secret)}`;
}

export function verifyPlivoStreamToken(token: string, secret: string, now = Date.now()) {
  if (secret.length < 32 || token.length > 512) return null;
  const [version, compactSession, encodedCallId, compactDirection, issuedAtValue, expiresAtValue, suppliedSignature, extra] = token.split(".");
  if (!version || !compactSession || !encodedCallId || !compactDirection || !issuedAtValue || !expiresAtValue || !suppliedSignature || extra) {
    return null;
  }
  const unsigned = [version, compactSession, encodedCallId, compactDirection, issuedAtValue, expiresAtValue].join(".");
  if (!safeEqual(suppliedSignature, hmac(unsigned, secret))) return null;
  try {
    const sessionId = expandSessionId(compactSession);
    const callId = Buffer.from(encodedCallId, "base64url").toString("utf8");
    if (Buffer.from(callId, "utf8").toString("base64url") !== encodedCallId) return null;
    const direction = compactDirection === "i" ? "inbound" : compactDirection === "o" ? "outbound" : null;
    const nowSeconds = Math.floor(now / 1000);
    const issuedAt = base36Integer(issuedAtValue);
    const expiresAt = base36Integer(expiresAtValue);
    if (
      version !== STREAM_TOKEN_VERSION.toString(36) ||
      !SESSION_ID_PATTERN.test(sessionId) ||
      !CALL_ID_PATTERN.test(callId) ||
      !direction ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > MAX_TOKEN_TTL_SECONDS ||
      issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS ||
      expiresAt < nowSeconds - MAX_CLOCK_SKEW_SECONDS
    ) return null;
    return {
      v: STREAM_TOKEN_VERSION,
      sessionId,
      callId,
      direction,
      iat: issuedAt,
      exp: expiresAt,
      nonce: suppliedSignature.slice(0, 16),
    } satisfies PlivoStreamTokenPayload;
  } catch {
    return null;
  }
}

export function normalizeE164(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Enter a phone number in E.164 format.");
  return normalized;
}

export function normalizePlivoE164(value: string) {
  const normalized = value.trim();
  return normalizeE164(normalized.startsWith("+") ? normalized : `+${normalized}`);
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function plivoStreamUrl(baseUrl: string, token: string) {
  const url = new URL(baseUrl);
  if (url.username || url.password) throw new Error("PLIVO_PUBLIC_BASE_URL cannot contain credentials.");
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) url.protocol = "ws:";
  else throw new Error("PLIVO_PUBLIC_BASE_URL must be an external HTTPS origin.");
  url.pathname = "/voice/plivo";
  url.search = "";
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildPlivoStreamXml(streamUrl: string, statusCallbackUrl: string, sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("The Plivo session identifier is invalid.");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" statusCallbackUrl="${xmlEscape(statusCallbackUrl)}" statusCallbackMethod="POST" extraHeaders="sessionId=${xmlEscape(sessionId)}">${xmlEscape(streamUrl)}</Stream>`,
    "</Response>",
  ].join("\n");
}

export class PlivoRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PlivoRequestError";
  }
}

export async function readPlivoForm(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new PlivoRequestError("Unsupported webhook content type", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PLIVO_FORM_BYTES) {
    throw new PlivoRequestError("Webhook payload too large", 413);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PLIVO_FORM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new PlivoRequestError("Webhook payload too large", 413);
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PlivoRequestError("Webhook payload is not valid UTF-8", 400);
  }

  const record: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of new URLSearchParams(body)) {
    count += 1;
    if (count > 80 || key.length < 1 || key.length > 120 || value.length > 20_000 || key in record) {
      throw new PlivoRequestError("Webhook form is invalid", 400);
    }
    record[key] = value;
  }
  return record;
}

export function publicRequestUrlCandidates(input: {
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  configuredBaseUrl?: string | null;
  webSocket?: boolean;
}) {
  const requestUrl = new URL(input.requestUrl, "http://127.0.0.1");
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const candidates = new Set<string>();
  const add = (origin: string) => {
    const base = new URL(origin);
    if (input.webSocket) base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    candidates.add(new URL(path, base).toString());
  };
  if (input.configuredBaseUrl) {
    add(input.configuredBaseUrl);
    return [...candidates];
  }
  candidates.add(requestUrl.toString());
  if (input.forwardedHost) {
    const forwardedProtocol = input.forwardedProto?.split(",")[0]?.trim() || "https";
    add(`${forwardedProtocol}://${input.forwardedHost.split(",")[0]?.trim()}`);
  }
  return [...candidates];
}
