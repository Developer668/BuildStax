import { isIP } from "node:net";

const DEFAULT_MAX_CALL_SECONDS = 900;
const MAX_AUDIO_PAYLOAD_CHARACTERS = 256 * 1024;

export function isPublicProviderHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    isIP(normalized) !== 0
  ) return false;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized);
}

export function boundedCallSeconds(value: string | undefined) {
  const parsed = Number(value || DEFAULT_MAX_CALL_SECONDS);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 60), 3_600) : DEFAULT_MAX_CALL_SECONDS;
}

export function resolveRealtimeSettings(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const model = environment.VOICE_AGENT_MODEL?.trim() || environment.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime";
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(model)) throw new Error("The realtime voice model identifier is invalid.");

  const configuredUrl = environment.VOICE_AGENT_WS_URL?.trim();
  const url = new URL(configuredUrl || `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`);
  if (
    url.protocol !== "wss:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    !isPublicProviderHostname(url.hostname)
  ) throw new Error("VOICE_AGENT_WS_URL must be a public WSS provider endpoint on port 443.");

  const allowedHosts = new Set(["api.openai.com"]);
  for (const host of (environment.VOICE_AGENT_ALLOWED_WS_HOSTS || "").split(",")) {
    const normalized = host.trim().toLowerCase().replace(/\.$/, "");
    if (!normalized) continue;
    if (!isPublicProviderHostname(normalized)) throw new Error("VOICE_AGENT_ALLOWED_WS_HOSTS contains an invalid host.");
    allowedHosts.add(normalized);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!allowedHosts.has(hostname)) throw new Error("VOICE_AGENT_WS_URL is not on the provider allowlist.");
  if (hostname === "api.openai.com") {
    if (url.pathname !== "/v1/realtime") throw new Error("The OpenAI realtime endpoint path is invalid.");
    for (const key of url.searchParams.keys()) {
      if (key !== "model") throw new Error("The OpenAI realtime endpoint contains unsupported query parameters.");
    }
  }

  const apiKey = environment.VOICE_AGENT_API_KEY?.trim() || (hostname === "api.openai.com" ? environment.OPENAI_API_KEY?.trim() : "") || "";
  if (!apiKey || apiKey.length > 512 || /[\u0000-\u0020\u007f]/.test(apiKey)) {
    throw new Error("Realtime voice inference is not configured with a valid provider credential.");
  }
  const voiceId = environment.VOICE_AGENT_VOICE_ID?.trim();
  const voice = voiceId ? { id: voiceId.slice(0, 160) } : (environment.OPENAI_REALTIME_VOICE?.trim() || "marin");
  return { apiKey, model, url: url.toString(), voice };
}

export function audioPayload(value: unknown, maxCharacters = MAX_AUDIO_PAYLOAD_CHARACTERS) {
  if (typeof value !== "string" || value.length < 1 || value.length > maxCharacters || value.length % 4 === 1) return null;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) ? value : null;
}

export function isDoNotCallRequest(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  return [
    /\bdo not call (?:me|us|this number)(?: again)?\b/,
    /\bdo not call again\b/,
    /\bdon'?t call (?:me|us|this number)(?: again)?\b/,
    /\bdon'?t call again\b/,
    /\bstop calling (?:me|us|this number)\b/,
    /\bremove (?:me|us|this number) from (?:your|the) (?:call|calling|contact) list\b/,
    /\btake (?:me|us|this number) off (?:your|the) (?:call|calling|contact) list\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function safeVoiceText(value: unknown, max = 4_000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
