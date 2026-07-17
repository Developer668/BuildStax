import { NextResponse } from "next/server";
import {
  buildLocalRealtimeSession,
  isValidLocalSdp,
  LOCAL_CALL_MAX_SDP_BYTES,
} from "@/lib/integrations/local-realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const requestHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
      .split(",", 1)[0]
      .trim()
      .toLowerCase();
    if (!requestHost || new URL(origin).host.toLowerCase() !== requestHost) {
      return new NextResponse("Cross-origin local calls are not allowed", { status: 403 });
    }
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/sdp") {
    return new NextResponse("Expected an SDP offer", { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > LOCAL_CALL_MAX_SDP_BYTES) {
    return new NextResponse("SDP offer is too large", { status: 413 });
  }

  const sdp = await request.text();
  if (!isValidLocalSdp(sdp)) return new NextResponse("Invalid SDP offer", { status: 400 });

  try {
    const session = buildLocalRealtimeSession();
    const apiKey = process.env.VOICE_AGENT_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
    if (!apiKey) return new NextResponse("Realtime voice is not configured", { status: 503 });

    const body = new FormData();
    body.set("sdp", sdp);
    body.set("session", JSON.stringify(session));
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const answer = await response.text();
    if (!response.ok) {
      console.error("Local Realtime call setup failed", response.status, answer.slice(0, 500));
      return new NextResponse("Realtime call setup failed", { status: 502 });
    }
    return new NextResponse(answer, {
      status: 201,
      headers: { "content-type": "application/sdp", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Local Realtime call setup failed", error);
    return new NextResponse("Realtime call setup unavailable", { status: 503 });
  }
}
