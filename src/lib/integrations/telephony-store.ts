import { createHash, randomUUID } from "node:crypto";

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
  direction: "inbound" | "outbound";
  name: string;
  category: string;
  location: string;
  contactName: string;
  email: string;
  requirements: string;
  preferredStyle: string;
  websiteStatus: string;
  sourceRef: string;
  offerPriceCents: number;
  enforcedFloorCents: number;
  estimatedCostCents: number;
  currency: string;
  timezone: string;
};

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
  const workspaceId = process.env.PLIVO_INBOUND_WORKSPACE_ID?.trim() || "";
  const campaignId = process.env.PLIVO_INBOUND_CAMPAIGN_ID?.trim() || "";
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId) || !/^cmp_[0-9a-f-]{36}$/i.test(campaignId)) {
    throw new Error("The inbound voice workspace and campaign are not configured.");
  }
  const client = await adminClient();
  const sessionId = deterministicId("tel", input.callId);
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
  const client = await adminClient();
  const result = await client.database.from("businesses")
    .select("name, category, location, contact_name, email, requirements, preferred_style, website_status, source_ref, campaign_id, estimated_site_cost_cents")
    .eq("workspace_id", session.workspace_id)
    .eq("id", session.business_id)
    .maybeSingle();
  assertResult(result, "InsForge could not read the voice business context.");
  const row = (result.data ?? {}) as Record<string, unknown>;
  const workspaceResult = await client.database.from("workspaces")
    .select("default_pricing_floor_cents, currency, timezone")
    .eq("id", session.workspace_id)
    .maybeSingle();
  assertResult(workspaceResult, "InsForge could not read the voice pricing policy.");
  const workspace = (workspaceResult.data ?? {}) as Record<string, unknown>;
  const campaignId = String(row.campaign_id || "");
  let campaignFloor = 0;
  if (campaignId) {
    const campaignResult = await client.database.from("campaigns")
      .select("pricing_floor_cents")
      .eq("workspace_id", session.workspace_id)
      .eq("id", campaignId)
      .maybeSingle();
    assertResult(campaignResult, "InsForge could not read the campaign pricing policy.");
    campaignFloor = Number((campaignResult.data as Record<string, unknown> | null)?.pricing_floor_cents || 0);
  }
  const estimatedCostCents = Math.max(1, Math.round(Number(row.estimated_site_cost_cents || 90_000)));
  const configuredFloor = Math.max(1, Math.round(Number(workspace.default_pricing_floor_cents || 150_000)), campaignFloor);
  const enforcedFloorCents = Math.max(configuredFloor, estimatedCostCents * 2);
  const quoteResult = await client.database.from("quotes")
    .select("proposed_price_cents")
    .eq("workspace_id", session.workspace_id)
    .eq("business_id", session.business_id)
    .in("status", ["sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1);
  assertResult(quoteResult, "InsForge could not check the current voice offer.");
  const activeQuote = Array.isArray(quoteResult.data) ? quoteResult.data[0] as Record<string, unknown> | undefined : undefined;
  const offerPriceCents = Math.max(enforcedFloorCents, Math.round(Number(activeQuote?.proposed_price_cents || enforcedFloorCents)));
  return {
    direction: session.direction,
    name: String(row.name || "New phone inquiry"),
    category: String(row.category || "Inbound website inquiry"),
    location: String(row.location || "Phone intake"),
    contactName: String(row.contact_name || ""),
    email: String(row.email || ""),
    requirements: String(row.requirements || ""),
    preferredStyle: String(row.preferred_style || ""),
    websiteStatus: String(row.website_status || "unknown"),
    sourceRef: String(row.source_ref || ""),
    offerPriceCents,
    enforcedFloorCents,
    estimatedCostCents,
    currency: String(workspace.currency || "USD"),
    timezone: String(workspace.timezone || "UTC"),
  };
}

function cleanField(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function cleanList(value: unknown, maxItems = 12, maxItemLength = 160) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanField(item, maxItemLength)).filter(Boolean))].slice(0, maxItems);
}

async function flushVoiceNexlaOutbox(client: Awaited<ReturnType<typeof adminClient>>, workspaceId: string) {
  const webhook = process.env.NEXLA_INGEST_URL?.trim();
  if (!webhook) return;
  const pending = await client.database.from("integration_outbox")
    .select("id, payload, attempts")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);
  if (pending.error || !Array.isArray(pending.data)) return;
  for (const row of pending.data as Array<Record<string, unknown>>) {
    const outboxId = cleanField(row.id, 200);
    const payload = row.payload;
    if (!outboxId || !payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    let delivered = false;
    let error = "";
    try {
      const event = payload as Record<string, unknown>;
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_id: `${cleanField(event.action, 160)}:${cleanField(event.entityId, 200)}:${cleanField(event.createdAt, 80)}`,
          workspace_id: cleanField(event.workspaceId, 100),
          actor_id: cleanField(event.actorId, 160),
          event_type: cleanField(event.action, 160),
          entity_type: cleanField(event.entityType, 80),
          entity_id: cleanField(event.entityId, 200),
          summary: cleanField(event.detail, 4_000),
          occurred_at: cleanField(event.createdAt, 80),
          source: "buildstax",
        }),
        signal: AbortSignal.timeout(4_000),
      });
      delivered = response.ok;
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch {
      error = "network_error";
    }
    await client.database.from("integration_outbox").update({
      status: delivered ? "delivered" : "pending",
      attempts: Math.max(0, Math.round(Number(row.attempts || 0))) + 1,
      last_error: error.slice(0, 500),
      delivered_at: delivered ? new Date().toISOString() : null,
    }).eq("workspace_id", workspaceId).eq("id", outboxId);
  }
}

async function recordVoiceAudit(input: {
  client: Awaited<ReturnType<typeof adminClient>>;
  session: TelephonySessionRow;
  idempotencyKey: string;
  action: string;
  detail: string;
}) {
  const result = await input.client.database.from("audit_events").insert([{
    id: deterministicId("aud", input.idempotencyKey),
    workspace_id: input.session.workspace_id,
    actor_id: "voice-agent",
    action: input.action,
    entity_type: "business",
    entity_id: input.session.business_id,
    detail: cleanField(input.detail, 4_000),
    created_at: new Date().toISOString(),
  }]);
  if (result.error && !/duplicate|unique/i.test(JSON.stringify(result.error))) {
    throw Object.assign(new Error("InsForge could not record the voice audit event."), { cause: result.error });
  }
  await flushVoiceNexlaOutbox(input.client, input.session.workspace_id).catch(() => undefined);
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
  const requirements = [
    cleanField(input.website_requirements, 8_000),
    cleanList(input.services).length ? `Services: ${cleanList(input.services).join(", ")}` : "",
    cleanField(input.desired_cta, 240) ? `Primary customer action: ${cleanField(input.desired_cta, 240)}` : "",
    cleanField(input.service_area, 300) ? `Service area: ${cleanField(input.service_area, 300)}` : "",
    cleanField(input.business_hours, 500) ? `Business hours: ${cleanField(input.business_hours, 500)}` : "",
    cleanField(input.current_website, 500) ? `Current website: ${cleanField(input.current_website, 500)}` : "",
    cleanField(input.urgency, 240) ? `Timing: ${cleanField(input.urgency, 240)}` : "",
  ].filter(Boolean).join("\n").slice(0, 12_000);
  if (requirements) patch.requirements = requirements;
  const currentWebsite = cleanField(input.current_website, 500).toLowerCase();
  if (currentWebsite) patch.website_status = /\b(?:none|no website|don'?t have|do not have)\b/.test(currentWebsite) ? "none" : "active";
  const priceAcknowledged = input.price_acknowledged === true;
  patch.stage = "interested";
  patch.next_action = priceAcknowledged
    ? "Prepare the floor-compliant quote and secure Stripe checkout"
    : "Review phone intake and confirm the website offer";
  patch.next_action_at = new Date().toISOString();
  const client = await adminClient();
  const updated = await client.database.from("businesses").update(patch)
    .eq("workspace_id", session.workspace_id).eq("id", session.business_id);
  assertResult(updated, "InsForge could not save the website intake.");
  await recordVoiceAudit({
    client,
    session,
    idempotencyKey: `voice-intake:${session.id}`,
    action: "voice.website_intake_saved",
    detail: priceAcknowledged
      ? "GPT Realtime saved the caller-confirmed website brief and verbal offer acknowledgement; a floor-compliant quote and verified Stripe payment are still required."
      : "GPT Realtime saved the caller-confirmed website brief; offer confirmation, quote, and verified Stripe payment are still required.",
  });
  return { saved: true, priceAcknowledged, nextStep: "quote_and_secure_checkout" };
}

export async function scheduleVoiceBusinessCallback(session: TelephonySessionRow, input: Record<string, unknown>) {
  const requestedTime = cleanField(input.requested_time, 120);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(requestedTime)) throw new Error("The callback time must include an explicit timezone offset.");
  const callbackAt = Date.parse(requestedTime);
  const now = Date.now();
  if (!Number.isFinite(callbackAt) || callbackAt < now + 60_000 || callbackAt > now + 90 * 24 * 60 * 60 * 1_000) {
    throw new Error("The callback time must be between one minute and 90 days from now.");
  }
  const reason = cleanField(input.reason, 300) || "Caller requested a website follow-up";
  const client = await adminClient();
  const result = await client.database.from("businesses").update({
    stage: "interested",
    next_action: `Call back: ${reason}`.slice(0, 500),
    next_action_at: new Date(callbackAt).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("workspace_id", session.workspace_id).eq("id", session.business_id);
  assertResult(result, "InsForge could not schedule the requested callback.");
  await recordVoiceAudit({
    client,
    session,
    idempotencyKey: `voice-callback:${session.id}:${new Date(callbackAt).toISOString()}`,
    action: "voice.callback_scheduled",
    detail: `The caller requested a callback at ${new Date(callbackAt).toISOString()}: ${reason}`,
  });
  return { scheduled: true, callbackAt: new Date(callbackAt).toISOString() };
}

export async function requestVoiceHumanFollowup(session: TelephonySessionRow, input: Record<string, unknown>) {
  const reason = cleanField(input.reason, 500) || "Caller requested human review";
  const preferredContact = cleanField(input.preferred_contact, 320);
  const client = await adminClient();
  const result = await client.database.from("businesses").update({
    stage: "interested",
    next_action: `Human follow-up required: ${reason}`.slice(0, 500),
    next_action_at: new Date().toISOString(),
    ...(preferredContact && preferredContact.includes("@") ? { email: preferredContact.toLowerCase() } : {}),
    updated_at: new Date().toISOString(),
  }).eq("workspace_id", session.workspace_id).eq("id", session.business_id);
  assertResult(result, "InsForge could not request human follow-up.");
  await recordVoiceAudit({
    client,
    session,
    idempotencyKey: `voice-handoff:${session.id}`,
    action: "voice.human_followup_requested",
    detail: `The voice agent stopped automated promises and requested human follow-up: ${reason}`,
  });
  return { requested: true };
}

export async function finalizeVoiceSalesCall(input: {
  session: TelephonySessionRow;
  outcome: "interested" | "follow_up" | "no_answer" | "not_interested" | "do_not_call";
  transcript: string;
  durationSeconds: number;
  intakeSaved: boolean;
  priceAcknowledged: boolean;
}) {
  const client = await adminClient();
  const now = new Date();
  if (input.outcome !== "do_not_call") {
    const callId = deterministicId("call", input.session.id);
    const existing = await client.database.from("calls").select("id")
      .eq("workspace_id", input.session.workspace_id).eq("id", callId).maybeSingle();
    assertResult(existing, "InsForge could not check the completed voice call.");
    if (!existing.data) {
      const inserted = await client.database.from("calls").insert([{
        id: callId,
        workspace_id: input.session.workspace_id,
        business_id: input.session.business_id,
        status: "completed",
        outcome: input.outcome,
        summary: `BuildStax voice sales call completed with outcome: ${input.outcome.replaceAll("_", " ")}.`,
        transcript: input.transcript.slice(0, 100_000),
        duration_seconds: Math.max(0, Math.min(86_400, Math.round(input.durationSeconds))),
        provider: "Plivo + OpenAI Realtime",
        mode: "live",
        cost_cents: 0,
        created_at: now.toISOString(),
      }]);
      assertResult(inserted, "InsForge could not persist the completed voice call.");
    }
  }

  const businessPatch: Record<string, unknown> = { last_contact_at: now.toISOString(), updated_at: now.toISOString() };
  if (input.outcome === "not_interested") Object.assign(businessPatch, { stage: "lost", next_action: "No further action", next_action_at: null });
  else if (input.outcome === "no_answer") Object.assign(businessPatch, { stage: "contacted", next_action: "Retry call if permitted", next_action_at: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString() });
  else if (input.outcome === "interested") Object.assign(businessPatch, { stage: "interested", next_action: input.priceAcknowledged ? "Prepare secure Stripe checkout" : "Review the website brief and confirm the offer", next_action_at: now.toISOString() });
  if (Object.keys(businessPatch).length > 2) {
    const updated = await client.database.from("businesses").update(businessPatch)
      .eq("workspace_id", input.session.workspace_id).eq("id", input.session.business_id);
    assertResult(updated, "InsForge could not persist the voice call outcome.");
  }

  let quoteId: string | null = null;
  if (input.outcome === "interested" && input.intakeSaved && input.priceAcknowledged) {
    const context = await getVoiceBusinessContext(input.session);
    const existingQuote = await client.database.from("quotes").select("id")
      .eq("workspace_id", input.session.workspace_id).eq("business_id", input.session.business_id)
      .in("status", ["sent", "accepted"]).order("created_at", { ascending: false }).limit(1);
    assertResult(existingQuote, "InsForge could not check the voice quote.");
    quoteId = Array.isArray(existingQuote.data) && existingQuote.data[0]
      ? String((existingQuote.data[0] as Record<string, unknown>).id)
      : null;
    if (!quoteId) {
      quoteId = deterministicId("quo", input.session.id);
      const scope = (context.requirements.trim() || `A focused BuildStax website for ${context.name}, including services, mobile presentation, and a clear customer contact action.`).slice(0, 12_000);
      const inserted = await client.database.from("quotes").insert([{
        id: quoteId,
        workspace_id: input.session.workspace_id,
        business_id: input.session.business_id,
        estimated_cost_cents: context.estimatedCostCents,
        configured_floor_cents: context.enforcedFloorCents,
        multiplier_floor_cents: context.estimatedCostCents * 2,
        enforced_floor_cents: context.enforcedFloorCents,
        proposed_price_cents: context.offerPriceCents,
        scope: scope.length >= 20 ? scope : `${scope} BuildStax website delivery and review.`,
        status: "sent",
        expires_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000).toISOString(),
        created_at: now.toISOString(),
      }]);
      assertResult(inserted, "InsForge could not prepare the floor-compliant voice quote.");
      const quoted = await client.database.from("businesses").update({
        stage: "quoted",
        next_action: "Create secure Stripe checkout and send the phone follow-up",
        next_action_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).eq("workspace_id", input.session.workspace_id).eq("id", input.session.business_id);
      assertResult(quoted, "InsForge could not advance the voice quote.");
    }
  }

  await recordVoiceAudit({
    client,
    session: input.session,
    idempotencyKey: `voice-outcome:${input.session.id}`,
    action: "voice.sales_call_completed",
    detail: `The Plivo and GPT Realtime sales call completed with outcome ${input.outcome}; confirmed intake=${input.intakeSaved}; price acknowledged=${input.priceAcknowledged}; quote=${quoteId || "not prepared"}.`,
  });
  return { completed: true, outcome: input.outcome, quoteId };
}

export async function getTelephonySession(id: string) {
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
