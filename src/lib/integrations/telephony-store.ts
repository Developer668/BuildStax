import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

export type VoiceBusinessContext = {
  name: string;
  category: string;
  location: string;
  contactName: string;
  email: string;
  requirements: string;
  preferredStyle: string;
};

function localBridgeEnabled() {
  return process.env.PLIVO_LOCAL_BRIDGE === "true" && process.env.NODE_ENV !== "production";
}

function localVoiceDirectory() {
  return path.join(process.cwd(), "data", "voice-bridge");
}

function localRecordPath(kind: "session" | "context" | "event" | "audit", id: string) {
  const safeId = createHash("sha256").update(id).digest("hex");
  return path.join(localVoiceDirectory(), `${kind}-${safeId}.json`);
}

async function readLocalRecord<T>(kind: "session" | "context", id: string) {
  try {
    return JSON.parse(await readFile(localRecordPath(kind, id), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalRecord(kind: "session" | "context" | "audit", id: string, value: unknown) {
  const directory = localVoiceDirectory();
  await mkdir(directory, { recursive: true });
  const target = localRecordPath(kind, id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function createLocalEvent(idempotencyKey: string, value: unknown) {
  await mkdir(localVoiceDirectory(), { recursive: true });
  const target = localRecordPath("event", idempotencyKey);
  try {
    const handle = await open(target, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value), "utf8");
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

async function adminClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("InsForge server configuration is required for telephony persistence.");
  const parsed = new URL(baseUrl);
  const local = ["127.0.0.1", "::1", "localhost"].includes(parsed.hostname.replace(/^\[|\]$/g, ""));
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production"))) {
    throw new Error("InsForge telephony persistence requires a trusted HTTPS API origin.");
  }
  const { createAdminClient } = await import("@insforge/sdk");
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
  providerCallId?: string;
  answeredAt?: string;
}) {
  if (localBridgeEnabled()) {
    const session: TelephonySessionRow = {
      id: input.id,
      workspace_id: "local_voice",
      business_id: input.businessId,
      status: input.status,
      direction: input.direction,
      provider_call_id: input.providerCallId || null,
      transcript: "",
    };
    await writeLocalRecord("session", input.id, session);
    return;
  }
  const client = await adminClient();
  const result = await client.database.from("telephony_sessions").insert([{
    id: input.id,
    workspace_id: input.workspaceId,
    business_id: input.businessId,
    provider: "Plivo",
    direction: input.direction,
    status: input.status,
    mode: input.mode,
    from_number: input.fromNumber,
    to_number: input.toNumber,
    provider_call_id: input.providerCallId || null,
    transcript: "",
    error: "",
    duration_seconds: 0,
    cost_cents: 0,
    answered_at: input.answeredAt || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }]);
  assertResult(result, "InsForge could not create the telephony session.");
}

function deterministicId(prefix: string, value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${prefix}_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getOrCreateInboundTelephonySession(input: {
  callId: string;
  fromNumber: string;
  toNumber: string;
}) {
  const sessionId = deterministicId("tel", input.callId);
  if (localBridgeEnabled()) {
    const existing = await readLocalRecord<TelephonySessionRow>("session", sessionId);
    if (existing) return existing;
    const businessId = deterministicId("biz_inbound", `local:${input.fromNumber}`);
    const context = await readLocalRecord<VoiceBusinessContext>("context", businessId);
    if (!context) {
      await writeLocalRecord("context", businessId, {
        name: `New phone inquiry ${input.fromNumber.slice(-4)}`,
        category: "Inbound website inquiry",
        location: "Phone intake",
        contactName: "",
        email: "",
        requirements: "",
        preferredStyle: "",
      } satisfies VoiceBusinessContext);
    }
    await createTelephonySession({
      id: sessionId,
      workspaceId: "local_voice",
      businessId,
      direction: "inbound",
      status: "in_progress",
      mode: "live",
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      providerCallId: input.callId,
      answeredAt: new Date().toISOString(),
    });
    const session = await readLocalRecord<TelephonySessionRow>("session", sessionId);
    if (!session) throw new Error("The local inbound telephony session could not be created.");
    return session;
  }
  const workspaceId = process.env.PLIVO_INBOUND_WORKSPACE_ID?.trim() || "";
  const campaignId = process.env.PLIVO_INBOUND_CAMPAIGN_ID?.trim() || "";
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId) || !/^cmp_[0-9a-f-]{36}$/i.test(campaignId)) {
    throw new Error("The inbound voice workspace and campaign are not configured.");
  }
  const client = await adminClient();
  const existingSession = await client.database.from("telephony_sessions")
    .select("id, workspace_id, business_id, status, direction, provider_request_id, provider_call_id, transcript")
    .eq("id", sessionId)
    .maybeSingle();
  assertResult(existingSession, "InsForge could not check the inbound telephony session.");
  if (existingSession.data) return existingSession.data as TelephonySessionRow;

  const businessId = deterministicId("biz_inbound", `${workspaceId}:${input.fromNumber}`);
  const existingBusiness = await client.database.from("businesses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", businessId)
    .maybeSingle();
  assertResult(existingBusiness, "InsForge could not check the inbound business record.");
  if (!existingBusiness.data) {
    const now = new Date().toISOString();
    const suffix = input.fromNumber.slice(-4);
    const inserted = await client.database.from("businesses").insert([{
      id: businessId,
      workspace_id: workspaceId,
      campaign_id: campaignId,
      name: `New phone inquiry ${suffix}`,
      category: "Inbound website inquiry",
      location: "Phone intake",
      address: "",
      contact_name: "",
      phone: input.fromNumber,
      email: "",
      website_status: "unknown",
      source: "inbound_phone",
      source_ref: `plivo:${input.fromNumber}`,
      stage: "interested",
      score: 90,
      do_not_call: false,
      estimated_site_cost_cents: 90_000,
      requirements: "",
      preferred_style: "",
      next_action: "Complete website intake by phone",
      next_action_at: now,
      created_at: now,
      updated_at: now,
    }]);
    assertResult(inserted, "InsForge could not create the inbound business record.");
  }

  await createTelephonySession({
    id: sessionId,
    workspaceId,
    businessId,
    direction: "inbound",
    status: "in_progress",
    mode: "live",
    fromNumber: input.fromNumber,
    toNumber: input.toNumber,
    providerCallId: input.callId,
    answeredAt: new Date().toISOString(),
  });
  const session = await getTelephonySession(sessionId);
  if (!session) throw new Error("InsForge did not return the inbound telephony session.");
  return session;
}

export async function getVoiceBusinessContext(session: TelephonySessionRow): Promise<VoiceBusinessContext> {
  if (localBridgeEnabled()) {
    return (await readLocalRecord<VoiceBusinessContext>("context", session.business_id)) ?? {
      name: "New phone inquiry",
      category: "Inbound website inquiry",
      location: "Phone intake",
      contactName: "",
      email: "",
      requirements: "",
      preferredStyle: "",
    };
  }
  const client = await adminClient();
  const result = await client.database.from("businesses")
    .select("name, category, location, contact_name, email, requirements, preferred_style")
    .eq("workspace_id", session.workspace_id)
    .eq("id", session.business_id)
    .maybeSingle();
  assertResult(result, "InsForge could not read the voice business context.");
  const row = (result.data ?? {}) as Record<string, unknown>;
  return {
    name: String(row.name || "New phone inquiry"),
    category: String(row.category || "Inbound website inquiry"),
    location: String(row.location || "Phone intake"),
    contactName: String(row.contact_name || ""),
    email: String(row.email || ""),
    requirements: String(row.requirements || ""),
    preferredStyle: String(row.preferred_style || ""),
  };
}

function cleanField(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

export async function saveVoiceBusinessIntake(session: TelephonySessionRow, input: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const mappings = [
    ["business_name", "name", 160],
    ["business_category", "category", 120],
    ["location", "location", 160],
    ["contact_name", "contact_name", 120],
    ["website_requirements", "requirements", 12_000],
    ["preferred_style", "preferred_style", 4_000],
  ] as const;
  for (const [source, target, max] of mappings) {
    const value = cleanField(input[source], max);
    if (value) patch[target] = value;
  }
  const email = cleanField(input.email, 320).toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) patch.email = email;
  patch.stage = "interested";
  patch.next_action = "Review phone intake and prepare a compliant quote";
  patch.next_action_at = new Date().toISOString();
  if (localBridgeEnabled()) {
    const current = await getVoiceBusinessContext(session);
    const updated: VoiceBusinessContext = {
      name: String(patch.name || current.name),
      category: String(patch.category || current.category),
      location: String(patch.location || current.location),
      contactName: String(patch.contact_name || current.contactName),
      email: String(patch.email || current.email),
      requirements: String(patch.requirements || current.requirements),
      preferredStyle: String(patch.preferred_style || current.preferredStyle),
    };
    await writeLocalRecord("context", session.business_id, updated);
    await writeLocalRecord("audit", `intake:${session.id}:${Date.now()}`, {
      action: "voice.website_intake_saved",
      entityId: session.business_id,
      createdAt: new Date().toISOString(),
    });
    return { saved: true, nextStep: "operator_quote_and_secure_checkout" };
  }
  const client = await adminClient();
  const updated = await client.database.from("businesses").update(patch)
    .eq("workspace_id", session.workspace_id).eq("id", session.business_id);
  assertResult(updated, "InsForge could not save the website intake.");
  const audit = await client.database.from("audit_events").insert([{
    id: `aud_${randomUUID()}`,
    workspace_id: session.workspace_id,
    actor_id: "voice-agent",
    action: "voice.website_intake_saved",
    entity_type: "business",
    entity_id: session.business_id,
    detail: "GPT Realtime saved the caller-confirmed business profile and website brief; quote and payment gates remain required.",
    created_at: new Date().toISOString(),
  }]);
  assertResult(audit, "InsForge could not record the website intake audit event.");
  return { saved: true, nextStep: "operator_quote_and_secure_checkout" };
}

export async function getTelephonySession(id: string) {
  if (localBridgeEnabled()) return readLocalRecord<TelephonySessionRow>("session", id);
  const client = await adminClient();
  const result = await client.database.from("telephony_sessions")
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
  if (localBridgeEnabled()) {
    const current = await readLocalRecord<TelephonySessionRow & Record<string, unknown>>("session", id);
    if (!current) throw new Error("The local telephony session does not exist.");
    await writeLocalRecord("session", id, { ...current, ...sanitized });
    return;
  }
  const client = await adminClient();
  const result = await client.database.from("telephony_sessions").update(sanitized).eq("id", id);
  assertResult(result, "InsForge could not update the telephony session.");
}

export function telephonySessionMatchesProvider(session: TelephonySessionRow, params: Record<string, string>) {
  if (session.provider_request_id && params.RequestUUID && session.provider_request_id !== params.RequestUUID) return false;
  if (session.provider_call_id && params.CallUUID && session.provider_call_id !== params.CallUUID) return false;
  return true;
}

export async function markBusinessDoNotCall(session: TelephonySessionRow) {
  if (localBridgeEnabled()) {
    const current = await getVoiceBusinessContext(session);
    await writeLocalRecord("context", session.business_id, { ...current, doNotCall: true });
    await writeLocalRecord("audit", `dnc:${session.id}:${Date.now()}`, {
      action: "voice.do_not_call",
      entityId: session.business_id,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const client = await adminClient();
  const result = await client.database.from("businesses").update({
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
    "STIRVerification", "StatusReason", "Error", "Timestamp",
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
  if (localBridgeEnabled()) {
    return createLocalEvent(input.idempotencyKey, {
      sessionId: input.session.id,
      eventType: input.eventType.slice(0, 80),
      providerCallId: input.providerCallId || null,
      payload: safePayload(input.payload ?? {}),
      createdAt: new Date().toISOString(),
    });
  }
  const client = await adminClient();
  const result = await client.database.from("telephony_events").insert([{
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
