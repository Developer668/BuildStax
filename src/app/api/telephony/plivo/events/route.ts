import { NextResponse } from "next/server";
import { validatePlivoSignature } from "@/lib/integrations/plivo";
import { PlivoRequestError, readPlivoForm } from "@/lib/integrations/plivo-protocol";
import {
  getTelephonySession,
  recordTelephonyEvent,
  telephonySessionMatchesProvider,
  updateTelephonySession,
} from "@/lib/integrations/telephony-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function duration(params: Record<string, string>) {
  const value = Number(params.BillDuration || params.Duration || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(86_400, Math.round(value))) : 0;
}

function costCents(params: Record<string, string>) {
  const value = Number(params.TotalCost || 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
}

function finalStatus(params: Record<string, string>) {
  const status = (params.CallStatus || params.Event || "").toLowerCase();
  if (["completed", "stopped"].includes(status)) return "completed" as const;
  if (["cancelled", "canceled", "no-answer", "busy", "timeout"].includes(status)) return "cancelled" as const;
  if (["failed", "rejected", "unreachable"].includes(status)) return "failed" as const;
  return null;
}

const callbackKinds = new Set(["ring", "stream", "fallback", "hangup"]);
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

function safeEventPart(value: string, fallback: string) {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId")?.trim() || "";
    const kind = url.searchParams.get("kind")?.trim().slice(0, 40) || "call";
    if (!/^tel_[0-9a-f-]{36}$/i.test(sessionId)) return new NextResponse("Invalid session", { status: 400 });
    if (!callbackKinds.has(kind)) return new NextResponse("Invalid event kind", { status: 400 });
    const nonce = request.headers.get("x-plivo-signature-v3-nonce");
    const signature = request.headers.get("x-plivo-signature-v3");
    if (!nonce || !signature) return new NextResponse("Invalid signature", { status: 401 });
    const params = await readPlivoForm(request);
    const valid = validatePlivoSignature({
      method: "POST",
      requestUrl: request.url,
      nonce,
      signature,
      params,
    });
    if (!valid) return new NextResponse("Invalid signature", { status: 401 });
    const session = await getTelephonySession(sessionId);
    if (!session) return new NextResponse("Session not found", { status: 404 });
    if (!telephonySessionMatchesProvider(session, params)) return new NextResponse("Call identity mismatch", { status: 409 });
    const providerCallId = params.CallUUID || session.provider_call_id || null;
    const providerIdentity = providerCallId || params.RequestUUID || session.provider_request_id;
    if (!providerIdentity || !/^[A-Za-z0-9_-]{8,160}$/.test(providerIdentity)) {
      return new NextResponse("Missing call identifier", { status: 400 });
    }
    if (params.CallUUID && !/^[A-Za-z0-9_-]{8,160}$/.test(params.CallUUID)) {
      return new NextResponse("Invalid call identifier", { status: 400 });
    }
    const eventPart = safeEventPart(params.Event || params.CallStatus || "received", "received");
    const streamPart = safeEventPart(params.StreamID || "stream", "stream");
    const eventName = `${kind}.${eventPart}`.slice(0, 80);
    const idempotencyKey = kind === "stream"
      ? `plivo:${kind}:${providerIdentity}:${streamPart}:${eventPart}`
      : `plivo:${kind}:${providerIdentity}`;
    const fresh = await recordTelephonyEvent({
      session,
      eventType: eventName,
      idempotencyKey,
      providerCallId,
      payload: params,
    });
    if (!fresh) return new NextResponse("OK", { status: 200 });
    if (terminalStatuses.has(session.status) && kind !== "hangup") return new NextResponse("OK", { status: 200 });

    if (kind === "ring") {
      if (session.status === "requested") {
        await updateTelephonySession(session.id, { status: "ringing", provider_call_id: params.CallUUID || undefined });
      }
    } else if (kind === "stream") {
      const event = (params.Event || "").toLowerCase().replace(/[^a-z]/g, "");
      const streamPatch = { provider_call_id: params.CallUUID || undefined, stream_id: params.StreamID };
      if (["startstream", "connected"].includes(event)) {
        await updateTelephonySession(session.id, { ...streamPatch, status: "in_progress", error: "" });
      } else if (["failed", "streamfailed", "droppedstream", "streamtimeout", "timeout"].includes(event)) {
        await updateTelephonySession(session.id, {
          ...streamPatch,
          status: "failed",
          error: params.StatusReason || "Plivo audio stream failed.",
          ended_at: new Date().toISOString(),
        });
      } else if (["degradedstream", "degraded"].includes(event)) {
        await updateTelephonySession(session.id, { ...streamPatch, error: "Plivo reported degraded audio streaming." });
      } else {
        await updateTelephonySession(session.id, streamPatch);
      }
    } else if (kind === "fallback") {
      await updateTelephonySession(session.id, { status: "failed", error: "Plivo could not load the call answer instructions." });
    } else if (kind === "hangup") {
      await updateTelephonySession(session.id, {
        status: finalStatus(params) ?? (duration(params) > 0 ? "completed" : "failed"),
        provider_call_id: params.CallUUID || undefined,
        duration_seconds: duration(params),
        cost_cents: costCents(params),
        error: params.HangupCause || "",
        ended_at: new Date().toISOString(),
      });
    }
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    if (error instanceof PlivoRequestError) return new NextResponse(error.message, { status: error.status });
    return new NextResponse("Telephony event unavailable", { status: 503 });
  }
}
