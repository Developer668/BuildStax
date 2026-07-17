import { NextResponse } from "next/server";
import { validatePlivoSignature, createPlivoAnswer } from "@/lib/integrations/plivo";
import { normalizeE164, PlivoRequestError, readPlivoForm } from "@/lib/integrations/plivo-protocol";
import { getOrCreateInboundTelephonySession, recordTelephonyEvent, updateTelephonySession } from "@/lib/integrations/telephony-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const nonce = request.headers.get("x-plivo-signature-v3-nonce");
    const signature = request.headers.get("x-plivo-signature-v3");
    if (!nonce || !signature) return new NextResponse("Invalid signature", { status: 401 });
    const params = await readPlivoForm(request);
    if (!validatePlivoSignature({ method: "POST", requestUrl: request.url, nonce, signature, params })) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
    const callId = params.CallUUID?.trim() || "";
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(callId) || params.Direction !== "inbound") {
      return new NextResponse("Invalid inbound call", { status: 400 });
    }
    const fromNumber = normalizeE164(params.From || "");
    const toNumber = normalizeE164(params.To || "");
    const ownedNumbers = new Set([process.env.PLIVO_PRIMARY_NUMBER, process.env.PLIVO_TEST_NUMBER].filter(Boolean));
    if (!ownedNumbers.has(toNumber)) return new NextResponse("Unknown destination", { status: 403 });

    const session = await getOrCreateInboundTelephonySession({ callId, fromNumber, toNumber });
    const providerStatus = (params.CallStatus || "").toLowerCase();
    if (["completed", "failed", "busy", "no-answer", "cancelled", "canceled"].includes(providerStatus)) {
      const completed = providerStatus === "completed";
      const duration = Math.max(0, Math.min(86_400, Math.round(Number(params.BillDuration || params.Duration || 0) || 0)));
      await updateTelephonySession(session.id, {
        status: completed ? "completed" : providerStatus === "failed" ? "failed" : "cancelled",
        duration_seconds: duration,
        error: completed ? "" : (params.HangupCause || `Plivo reported ${providerStatus}.`),
        ended_at: new Date().toISOString(),
      });
      await recordTelephonyEvent({
        session,
        eventType: `hangup.${providerStatus}`,
        idempotencyKey: `plivo:inbound:hangup:${callId}`,
        providerCallId: callId,
        payload: params,
      });
      return new NextResponse("OK", { status: 200, headers: { "cache-control": "no-store" } });
    }
    await recordTelephonyEvent({
      session,
      eventType: "answer.inbound",
      idempotencyKey: `plivo:inbound:${callId}`,
      providerCallId: callId,
      payload: params,
    });
    return new NextResponse(createPlivoAnswer({ sessionId: session.id, callId, direction: "inbound" }), {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PlivoRequestError) return new NextResponse(error.message, { status: error.status });
    return new NextResponse("Inbound voice intake unavailable", { status: 503 });
  }
}
