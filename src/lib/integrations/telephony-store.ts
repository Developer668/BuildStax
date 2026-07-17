import { createAdminClient } from "@insforge/sdk";
import { randomUUID } from "node:crypto";

type TelephonySessionStatus = "requested" | "ringing" | "in_progress" | "completed" | "failed" | "cancelled";
type TelephonySessionPatch = Partial<{
  status: TelephonySessionStatus;
  provider_request_id: string;
  provider_call_id: string;
  stream_id: string;
  transcript: string;
  error: string;
  duration_seconds: number;
  cost_cents: number;
  answered_at: string;
  ended_at: string;
}>;

type TelephonySessionRow = {
  id: string;
  workspace_id: string;
  business_id: string;
  status: TelephonySessionStatus;
  direction: "inbound" | "outbound";
  provider_request_id?: string | null;
  provider_call_id?: string | null;
  transcript?: string;
};

function adminClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("InsForge server configuration is required for telephony persistence.");
  const parsed = new URL(baseUrl);
  const local = ["127.0.0.1", "::1", "localhost"].includes(parsed.hostname.replace(/^\[|\]$/g, ""));
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production"))) {
    throw new Error("InsForge telephony persistence requires a trusted HTTPS API origin.");
  }
  return createAdminClient({ baseUrl: parsed.origin, apiKey });
}

function assertResult(result: { error: unknown }, message: string) {
  if (result.error) throw Object.assign(new Error(message), { cause: result.error });
}

export async function createTelephonySession(input: {
  id: string;
  workspaceId: string;
  businessId: string;
  direction: "inbound" | "outbound";
  status: TelephonySessionStatus;
  mode: "sandbox" | "live";
  fromNumber: string;
  toNumber: string;
}) {
  const result = await adminClient().database.from("telephony_sessions").insert([{
    id: input.id,
    workspace_id: input.workspaceId,
    business_id: input.businessId,
    provider: "Plivo",
    direction: input.direction,
    status: input.status,
    mode: input.mode,
    from_number: input.fromNumber,
    to_number: input.toNumber,
    transcript: "",
    error: "",
    duration_seconds: 0,
    cost_cents: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }]);
  assertResult(result, "InsForge could not create the telephony session.");
}

export async function getTelephonySession(id: string) {
  const result = await adminClient().database.from("telephony_sessions")
    .select("id, workspace_id, business_id, status, direction, provider_request_id, provider_call_id, transcript")
    .eq("id", id)
    .maybeSingle();
  assertResult(result, "InsForge could not read the telephony session.");
  return (result.data as TelephonySessionRow | null) ?? null;
}

export async function updateTelephonySession(id: string, patch: TelephonySessionPatch) {
  const sanitized: Record<string, unknown> = {};
  if (patch.status) sanitized.status = patch.status;
  for (const key of ["provider_request_id", "provider_call_id", "stream_id", "answered_at", "ended_at"] as const) {
    if (patch[key]) sanitized[key] = patch[key].trim().slice(0, 160);
  }
  if (patch.transcript !== undefined) sanitized.transcript = patch.transcript.replace(/\u0000/g, "").slice(0, 100_000);
  if (patch.error !== undefined) sanitized.error = patch.error.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 2_000);
  if (patch.duration_seconds !== undefined) sanitized.duration_seconds = Math.max(0, Math.min(86_400, Math.round(patch.duration_seconds)));
  if (patch.cost_cents !== undefined) sanitized.cost_cents = Math.max(0, Math.min(2_147_483_647, Math.round(patch.cost_cents)));
  sanitized.updated_at = new Date().toISOString();
  const result = await adminClient().database.from("telephony_sessions").update(sanitized).eq("id", id);
  assertResult(result, "InsForge could not update the telephony session.");
}

export function telephonySessionMatchesProvider(session: TelephonySessionRow, params: Record<string, string>) {
  if (session.provider_request_id && params.RequestUUID && session.provider_request_id !== params.RequestUUID) return false;
  if (session.provider_call_id && params.CallUUID && session.provider_call_id !== params.CallUUID) return false;
  return true;
}

export async function markBusinessDoNotCall(session: TelephonySessionRow) {
  const result = await adminClient().database.from("businesses").update({
    do_not_call: true,
    stage: "dnc",
    next_action: "No outreach permitted",
    next_action_at: null,
    updated_at: new Date().toISOString(),
  }).eq("workspace_id", session.workspace_id).eq("id", session.business_id);
  assertResult(result, "InsForge could not persist the do-not-call request.");
}

function safePayload(payload: Record<string, string>) {
  const allowed = new Set([
    "CallUUID", "RequestUUID", "StreamID", "Event", "CallStatus", "Direction", "From", "To",
    "Duration", "BillDuration", "TotalCost", "HangupCause", "HangupCauseCode", "HangupSource",
    "STIRVerification", "StatusReason", "Timestamp",
  ]);
  return Object.fromEntries(Object.entries(payload)
    .filter(([key]) => allowed.has(key))
    .slice(0, 30)
    .map(([key, value]) => [key, value.slice(0, 500)]));
}

export async function recordTelephonyEvent(input: {
  session: TelephonySessionRow;
  eventType: string;
  idempotencyKey: string;
  providerCallId?: string | null;
  payload?: Record<string, string>;
}) {
  const result = await adminClient().database.from("telephony_events").insert([{
    id: `tev_${randomUUID()}`,
    workspace_id: input.session.workspace_id,
    session_id: input.session.id,
    event_type: input.eventType.slice(0, 80),
    idempotency_key: input.idempotencyKey.slice(0, 240),
    provider_call_id: input.providerCallId || null,
    payload: safePayload(input.payload ?? {}),
    created_at: new Date().toISOString(),
  }]);
  if (!result.error) return true;
  const message = JSON.stringify(result.error);
  if (/duplicate|unique|idempotency/i.test(message)) return false;
  throw Object.assign(new Error("InsForge could not record the telephony event."), { cause: result.error });
}
