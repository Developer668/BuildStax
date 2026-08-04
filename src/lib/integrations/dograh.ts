import "server-only";

/**
 * Configuration for the secondary, browser-based Dograh voice call.
 *
 * Dograh (https://www.dograh.com/) is a self-hosted voice-agent platform. This
 * feature embeds its Web Call widget so an operator can talk to the BuildStax
 * sales agent locally, without telephony, as a fallback to the primary Plivo
 * phone path. The widget authenticates by domain allowlisting, so no secret ever
 * reaches the browser — only the non-secret embed config below.
 */
export type DograhLocalCallConfig = {
  enabled: boolean;
  /** URL of the dashboard-generated `dograh-widget.js`. */
  scriptUrl: string;
  /** Extra `<script>` attributes copied from the dashboard embed snippet. */
  attrs: Record<string, string>;
  /** Dograh backend origin, used for CSP and the "view run" dashboard link. */
  origin: string;
};

type Env = Readonly<Record<string, string | undefined>>;

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function resolveOrigin(env: Env): string {
  return env.DOGRAH_ORIGIN?.trim() || originOf(env.DOGRAH_WIDGET_SCRIPT_URL?.trim() ?? "");
}

function parseAttrs(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    // Only safe HTML attribute names with string values (no `src`, which we own).
    if (typeof value !== "string") continue;
    if (key.toLowerCase() === "src") continue;
    if (!/^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(key)) continue;
    attrs[key] = value;
  }
  return attrs;
}

/**
 * The local Dograh call is available only outside production (Dograh runs on the
 * operator's machine), and only when explicitly enabled with a widget script URL.
 */
export function isDograhLocalCallsEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV === "production" || env.APP_MODE === "production") return false;
  if (env.DOGRAH_LOCAL_CALLS_ENABLED !== "true") return false;
  return Boolean(env.DOGRAH_WIDGET_SCRIPT_URL?.trim());
}

export function dograhLocalCallConfig(env: Env = process.env): DograhLocalCallConfig {
  if (!isDograhLocalCallsEnabled(env)) {
    return { enabled: false, scriptUrl: "", attrs: {}, origin: "" };
  }
  return {
    enabled: true,
    scriptUrl: env.DOGRAH_WIDGET_SCRIPT_URL!.trim(),
    attrs: parseAttrs(env.DOGRAH_WIDGET_ATTRS),
    origin: resolveOrigin(env),
  };
}

/**
 * Origins the embedded widget needs to reach, for the route's CSP. Includes the
 * Dograh backend origin plus its WebSocket variant for signaling. Empty when the
 * feature is disabled so production CSP is never widened.
 */
export function dograhCspOrigins(env: Env = process.env): string[] {
  if (!isDograhLocalCallsEnabled(env)) return [];
  const origin = resolveOrigin(env);
  if (!origin) return [];
  const origins = new Set<string>([origin]);
  if (origin.startsWith("http://")) origins.add(`ws://${origin.slice("http://".length)}`);
  else if (origin.startsWith("https://")) origins.add(`wss://${origin.slice("https://".length)}`);
  return [...origins];
}
