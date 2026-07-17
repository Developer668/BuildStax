import { NextResponse } from "next/server";
import { createPlivoAnswer, validatePlivoSignature } from "@/lib/integrations/plivo";
import { PlivoRequestError, readPlivoForm } from "@/lib/integrations/plivo-protocol";
import {
  getTelephonySession,
  recordTelephonyEvent,
  telephonySessionMatchesProvider,
  updateTelephonySession,
} from "@/lib/integrations/telephony-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() || "";
  if (!/^tel_[0-9a-f-]{36}$/i.test(sessionId)) return new NextResponse("Invalid session", { status: 400 });
  const nonce = request.headers.get("x-plivo-signature-v3-nonce");
  const signature = request.headers.get("x-plivo-signature-v3");
  if (!nonce || !signature) return new NextResponse("Invalid signature", { status: 401 });
  const params = request.method === "POST"
    ? await readPlivoForm(request)
    : Object.fromEntries(url.searchParams.entries());
  const valid = validatePlivoSignature({
    method: request.method,
    requestUrl: request.url,
    nonce,
    signature,
    params: request.method === "POST" ? params : undefined,
  });
  if (!valid) return new NextResponse("Invalid signature", { status: 401 });

  const session = await getTelephonySession(sessionId);
  if (!session) return new NextResponse("Session not found", { status: 404 });
  if (!["requested", "ringing", "in_progress"].includes(session.status)) {
    return new NextResponse("Session is no longer active", { status: 409 });
  }
  if (!telephonySessionMatchesProvider(session, params)) return new NextResponse("Call identity mismatch", { status: 409 });
  const callId = params.CallUUID;
  if (!callId || !/^[A-Za-z0-9_-]{8,160}$/.test(callId)) return new NextResponse("Missing call identifier", { status: 400 });
  const direction = params.Direction === "inbound" ? "inbound" : "outbound";
  if (direction !== session.direction) return new NextResponse("Call direction mismatch", { status: 409 });
  const fresh = await recordTelephonyEvent({
    session,
    eventType: "answer",
    idempotencyKey: `plivo:answer:${callId}`,
    providerCallId: callId,
    payload: params,
  });
  if (fresh) {
    await updateTelephonySession(session.id, {
      status: "in_progress",
      provider_call_id: callId,
      answered_at: new Date().toISOString(),
      error: "",
    });
  }
  return new NextResponse(createPlivoAnswer({ sessionId, callId, direction }), {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    if (error instanceof PlivoRequestError) return new NextResponse(error.message, { status: error.status });
    return new NextResponse("Telephony bridge unavailable", { status: 503 });
  }
}

export async function GET(request: Request) {
  try {
    return await handle(request);
  } catch {
    return new NextResponse("Telephony bridge unavailable", { status: 503 });
  }
}
