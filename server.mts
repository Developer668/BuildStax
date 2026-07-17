import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import { validateV3Signature } from "plivo";
import { WebSocket, WebSocketServer } from "ws";
import {
  publicRequestUrlCandidates,
  verifyPlivoStreamToken,
  type PlivoStreamTokenPayload,
} from "./src/lib/integrations/plivo-protocol";
import {
  getTelephonySession,
  getVoiceBusinessContext,
  finalizeVoiceSalesCall,
  markBusinessDoNotCall,
  recordTelephonyEvent,
  requestVoiceHumanFollowup,
  saveVoiceBusinessIntake,
  scheduleVoiceBusinessCallback,
  updateTelephonySession,
} from "./src/lib/integrations/telephony-store";
import {
  audioPayload,
  boundedCallSeconds,
  isDoNotCallRequest,
  resolveRealtimeSettings,
  safeVoiceText,
} from "./src/lib/integrations/voice-protocol";
import {
  buildVoiceSalesInstructions,
  classifyVoiceSalesOutcome,
  detectVoiceSalesSignals,
  voiceSalesGreeting,
  type VoiceSalesStage,
} from "./src/lib/integrations/voice-sales";

function commandLineValue(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dev = process.env.NODE_ENV !== "production";
const hostname = commandLineValue("hostname") || process.env.HOSTNAME || "127.0.0.1";
const requestedPort = Number(commandLineValue("port") || process.env.PORT || 3000);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535 ? requestedPort : 3000;
const voicePath = "/voice/plivo";
const maxCallSeconds = boundedCallSeconds(process.env.PLIVO_MAX_CALL_SECONDS);
const maxVoiceConnections = Math.min(Math.max(Number(process.env.PLIVO_MAX_CONCURRENT_STREAMS || 20) || 20, 1), 100);
const maxSocketBufferBytes = 1024 * 1024;

function header(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function rejectUpgrade(socket: import("node:stream").Duplex, status: number, message: string) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function validPlivoUpgrade(request: IncomingMessage) {
  const authToken = process.env.PLIVO_AUTH_TOKEN || "";
  const publicBaseUrl = process.env.PLIVO_PUBLIC_BASE_URL || "";
  const signatureHeader = header(request, "x-plivo-signature-v3") || "";
  const nonce = header(request, "x-plivo-signature-v3-nonce") || "";
  if (!authToken || !publicBaseUrl || !signatureHeader || !nonce) return false;
  const requestUrl = new URL(request.url || "/", `http://${header(request, "host") || "127.0.0.1"}`).toString();
  const candidates = publicRequestUrlCandidates({
    requestUrl,
    configuredBaseUrl: publicBaseUrl,
    webSocket: true,
  });
  const signatures = signatureHeader.split(",").map((value) => value.trim()).filter(Boolean);
  return candidates.some((candidate) => signatures.some((signature) => Boolean(validateV3Signature(
    "GET", candidate, nonce, authToken, signature,
  ))));
}

function systemInstructions(context: Awaited<ReturnType<typeof getVoiceBusinessContext>>) {
  return buildVoiceSalesInstructions(context);
}

function initialGreeting() {
  const configured = safeVoiceText(process.env.VOICE_AGENT_GREETING, 1_000);
  return `${voiceSalesGreeting()}${configured ? ` After the exact disclosure and permission question, use this additional greeting guidance only if it does not conflict: ${configured}` : ""}`;
}

function safeJson(data: WebSocket.RawData) {
  try {
    const parsed = JSON.parse(data.toString()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function sendJson(socket: WebSocket, value: unknown) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > maxSocketBufferBytes) {
    socket.close(1013, "Audio backpressure limit reached");
    return false;
  }
  socket.send(JSON.stringify(value));
  return true;
}

async function bridgeConnection(plivoSocket: WebSocket, token: PlivoStreamTokenPayload) {
  const pendingPlivoMessages: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];
  let pendingPlivoBytes = 0;
  const bufferPendingPlivoMessage = (data: WebSocket.RawData, isBinary: boolean) => {
    const bytes = Array.isArray(data) ? data.reduce((total, chunk) => total + chunk.byteLength, 0) : data.byteLength;
    pendingPlivoBytes += bytes;
    if (pendingPlivoMessages.length >= 256 || pendingPlivoBytes > maxSocketBufferBytes) {
      plivoSocket.close(1013, "Voice bridge initialization exceeded its buffer limit");
      return;
    }
    pendingPlivoMessages.push({ data, isBinary });
  };
  // Plivo sends `start` immediately after upgrade, before the persistence reads below can finish.
  plivoSocket.on("message", bufferPendingPlivoMessage);
  const session = await getTelephonySession(token.sessionId);
  if (!session) return plivoSocket.close(1008, "Unknown telephony session");
  if (
    !["requested", "ringing", "in_progress"].includes(session.status) ||
    session.direction !== token.direction ||
    session.provider_call_id !== token.callId
  ) return plivoSocket.close(1008, "Telephony session mismatch");
  const businessContext = await getVoiceBusinessContext(session);

  let streamId = "";
  let plivoStarted = false;
  let realtimeReady = false;
  let greetingRequested = false;
  let dncRequested = false;
  let intakeSaved = false;
  let priceAcknowledged = false;
  let callbackScheduled = false;
  let handoffRequested = false;
  let explicitNotInterested = false;
  let currentSalesStage: VoiceSalesStage = "opener";
  let finished = false;
  const connectedAt = Date.now();
  const transcript: string[] = [];
  let transcriptCharacters = 0;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const settings = resolveRealtimeSettings();
  const realtimeSocket = new WebSocket(settings.url, {
    headers: { authorization: `Bearer ${settings.apiKey}` },
    handshakeTimeout: 10_000,
    maxPayload: 512 * 1024,
    perMessageDeflate: false,
  });

  const appendTranscript = (role: "Customer" | "Agent", value: unknown) => {
    const clean = safeVoiceText(value);
    if (!clean || transcriptCharacters >= 100_000) return "";
    const prefix = `${role}: `;
    const line = `${prefix}${clean.slice(0, Math.max(0, 100_000 - transcriptCharacters - prefix.length - 1))}`;
    if (line.length <= prefix.length) return "";
    transcript.push(line);
    transcriptCharacters += line.length + 1;
    return clean;
  };

  const persistTranscript = async () => {
    const joined = transcript.join("\n").slice(0, 100_000);
    await updateTelephonySession(session.id, { transcript: joined });
  };
  const recordSalesStage = (stage: VoiceSalesStage) => {
    if (stage === currentSalesStage) return;
    currentSalesStage = stage;
    void recordTelephonyEvent({
      session,
      eventType: `sales.stage.${stage}`,
      idempotencyKey: `sales-stage:${session.id}:${stage}`,
      providerCallId: token.callId,
    }).catch(() => undefined);
  };
  let dncTimer: NodeJS.Timeout | undefined;
  const finish = async (error = "") => {
    if (finished) return;
    finished = true;
    clearTimeout(callTimer);
    clearTimeout(startTimer);
    if (dncTimer) clearTimeout(dncTimer);
    if (realtimeSocket.readyState === WebSocket.OPEN || realtimeSocket.readyState === WebSocket.CONNECTING) realtimeSocket.close();
    try {
      await persistTranscript().catch(() => undefined);
      await recordTelephonyEvent({
        session,
        eventType: error ? "stream.bridge_failed" : "stream.disconnected",
        idempotencyKey: `bridge:${session.id}:${streamId || token.nonce}`,
        providerCallId: token.callId,
        payload: error ? { StatusReason: error } : {},
      }).catch(() => undefined);
      if (error && !dncRequested) {
        await updateTelephonySession(session.id, { status: "failed", error, ended_at: new Date().toISOString() }).catch(() => undefined);
      } else if (!dncRequested) {
        await updateTelephonySession(session.id, { status: "completed", error: "", ended_at: new Date().toISOString() }).catch(() => undefined);
      }
      const transcriptText = transcript.join("\n").slice(0, 100_000);
      const outcome = classifyVoiceSalesOutcome({
        transcript: transcriptText,
        intakeSaved,
        callbackScheduled,
        handoffRequested,
        explicitNotInterested,
        doNotCall: dncRequested,
      });
      await finalizeVoiceSalesCall({
        session,
        outcome,
        transcript: transcriptText,
        durationSeconds: Math.round((Date.now() - connectedAt) / 1_000),
        intakeSaved,
        priceAcknowledged,
      }).catch(() => undefined);
    } finally {
      resolveDone();
    }
  };
  const requestGreeting = () => {
    if (greetingRequested || !plivoStarted || !realtimeReady || realtimeSocket.readyState !== WebSocket.OPEN) return;
    greetingRequested = true;
    sendJson(realtimeSocket, { type: "response.create", response: { instructions: initialGreeting(), output_modalities: ["audio"] } });
  };
  const handleDoNotCall = async () => {
    if (dncRequested) return;
    dncRequested = true;
    if (streamId) sendJson(plivoSocket, { event: "clearAudio", streamId });
    sendJson(realtimeSocket, { type: "response.cancel" });
    try {
      await markBusinessDoNotCall(session);
      await updateTelephonySession(session.id, { status: "cancelled", error: "", ended_at: new Date().toISOString() });
      await recordTelephonyEvent({
        session,
        eventType: "compliance.do_not_call",
        idempotencyKey: `compliance:dnc:${session.id}`,
        providerCallId: token.callId,
      });
      sendJson(realtimeSocket, {
        type: "response.create",
        response: {
          instructions: "Acknowledge the do-not-call request in one brief sentence, apologize, say goodbye, and do not continue the sales conversation.",
          output_modalities: ["audio"],
        },
      });
      dncTimer = setTimeout(() => {
        if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1000, "Do-not-call request honored");
      }, 6_000);
    } catch {
      if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1011, "Compliance update failed");
      await finish("The do-not-call request could not be persisted.");
    }
  };
  const callTimer = setTimeout(() => {
    if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1000, "Maximum call duration reached");
  }, maxCallSeconds * 1000);
  const startTimer = setTimeout(() => {
    if (!plivoStarted && plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1008, "Stream start timed out");
  }, 10_000);

  realtimeSocket.on("open", () => {
    sendJson(realtimeSocket, {
      type: "session.update",
      session: {
        type: "realtime",
        model: settings.model,
        instructions: systemInstructions(businessContext),
        output_modalities: ["audio"],
        max_output_tokens: 700,
        tools: [{
          type: "function",
          name: "save_business_website_intake",
          description: "Persist caller-confirmed business details and the website brief. Use only after confirming the details aloud.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              business_name: { type: "string" },
              business_category: { type: "string" },
              location: { type: "string" },
              contact_name: { type: "string" },
              email: { type: "string" },
              services: { type: "array", items: { type: "string" }, maxItems: 12 },
              desired_cta: { type: "string" },
              service_area: { type: "string" },
              business_hours: { type: "string" },
              current_website: { type: "string" },
              website_requirements: { type: "string" },
              preferred_style: { type: "string" },
              urgency: { type: "string" },
              price_acknowledged: { type: "boolean" },
            },
            required: ["business_name", "business_category", "location", "contact_name", "email", "services", "desired_cta", "website_requirements", "preferred_style", "price_acknowledged"],
          },
        }, {
          type: "function",
          name: "schedule_website_callback",
          description: "Schedule a caller-confirmed website follow-up. Use only after confirming an exact date, time, and timezone.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              requested_time: { type: "string", description: "ISO 8601 date-time with Z or an explicit numeric timezone offset." },
              reason: { type: "string" },
            },
            required: ["requested_time", "reason"],
          },
        }, {
          type: "function",
          name: "request_human_followup",
          description: "Stop automated promises and request a human follow-up for an unsupported, risky, or explicitly human-requested issue.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              reason: { type: "string" },
              preferred_contact: { type: "string" },
            },
            required: ["reason", "preferred_contact"],
          },
        }],
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            noise_reduction: { type: "near_field" },
            transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
            turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
          },
          output: { format: { type: "audio/pcmu" }, voice: settings.voice, speed: 1.0 },
        },
      },
    });
  });

  realtimeSocket.on("message", (data, isBinary) => {
    if (isBinary) return realtimeSocket.close(1003, "Binary events are not supported");
    const event = safeJson(data);
    if (!event) return;
    const type = safeVoiceText(event.type, 100);
    if (type === "session.updated") {
      realtimeReady = true;
      requestGreeting();
      return;
    }
    if (type === "response.output_audio.delta") {
      const payload = audioPayload(event.delta);
      if (payload && plivoSocket.readyState === WebSocket.OPEN) {
        if (!sendJson(plivoSocket, { event: "playAudio", media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload } })) {
          void finish("Plivo audio output exceeded the backpressure limit.");
        }
      }
      return;
    }
    if (type === "input_audio_buffer.speech_started" && streamId && plivoSocket.readyState === WebSocket.OPEN) {
      sendJson(plivoSocket, { event: "clearAudio", streamId });
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const value = appendTranscript("Customer", event.transcript);
      if (value) {
        const signals = detectVoiceSalesSignals(value);
        recordSalesStage(signals.stage);
        if (signals.notInterested) explicitNotInterested = true;
        if (isDoNotCallRequest(value) || signals.optOut) void handleDoNotCall();
      }
      return;
    }
    if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      appendTranscript("Agent", event.transcript);
      return;
    }
    if (type === "response.output_audio.done" && dncRequested) {
      if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1000, "Do-not-call request honored");
      return;
    }
    if (type === "response.output_item.done") {
      const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : {};
      const toolName = safeVoiceText(item.name, 120);
      if (item.type !== "function_call" || !["save_business_website_intake", "schedule_website_callback", "request_human_followup"].includes(toolName)) return;
      const callId = safeVoiceText(item.call_id, 160);
      if (!callId) return;
      void (async () => {
        let output: Record<string, unknown>;
        try {
          const args = JSON.parse(safeVoiceText(item.arguments, 20_000) || "{}") as unknown;
          if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid intake arguments");
          if (toolName === "save_business_website_intake") {
            output = await saveVoiceBusinessIntake(session, args as Record<string, unknown>);
            intakeSaved = output.saved === true;
            priceAcknowledged = output.priceAcknowledged === true;
            recordSalesStage("readback_confirm");
          } else if (toolName === "schedule_website_callback") {
            output = await scheduleVoiceBusinessCallback(session, args as Record<string, unknown>);
            callbackScheduled = output.scheduled === true;
            recordSalesStage("callback");
          } else {
            output = await requestVoiceHumanFollowup(session, args as Record<string, unknown>);
            handoffRequested = output.requested === true;
            recordSalesStage("handoff");
          }
        } catch {
          output = { ok: false, error: "That action could not be completed. Confirm the important detail with the caller and try once more." };
        }
        sendJson(realtimeSocket, {
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
        });
        sendJson(realtimeSocket, { type: "response.create" });
      })();
      return;
    }
    if (type === "error") {
      const detail = event.error && typeof event.error === "object" ? safeVoiceText((event.error as Record<string, unknown>).message, 500) : "";
      const message = detail || "Realtime voice inference failed.";
      if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1011, "Voice inference failed");
      void finish(message);
    }
  });

  realtimeSocket.on("error", () => {
    if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1011, "Voice inference unavailable");
    void finish("Realtime voice inference connection failed.");
  });
  realtimeSocket.on("close", () => {
    if (!finished && plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1011, "Voice inference disconnected");
  });

  const handlePlivoMessage = (data: WebSocket.RawData, isBinary: boolean) => {
    if (isBinary) return plivoSocket.close(1003, "Binary events are not supported");
    const event = safeJson(data);
    if (!event) return;
    const eventType = safeVoiceText(event.event, 40);
    if (eventType === "start") {
      if (plivoStarted) return plivoSocket.close(1008, "Duplicate stream start");
      const start = event.start && typeof event.start === "object" ? event.start as Record<string, unknown> : {};
      const callId = safeVoiceText(start.callId, 160);
      const accountId = safeVoiceText(start.accountId, 160);
      const mediaFormat = start.mediaFormat && typeof start.mediaFormat === "object" ? start.mediaFormat as Record<string, unknown> : {};
      if (callId !== token.callId || accountId !== process.env.PLIVO_AUTH_ID || mediaFormat.encoding !== "audio/x-mulaw" || Number(mediaFormat.sampleRate) !== 8000) {
        plivoSocket.close(1008, "Stream metadata mismatch");
        return;
      }
      streamId = safeVoiceText(start.streamId, 160);
      if (!/^[A-Za-z0-9_-]{8,160}$/.test(streamId)) return plivoSocket.close(1008, "Missing stream identifier");
      plivoStarted = true;
      clearTimeout(startTimer);
      void Promise.all([
        updateTelephonySession(session.id, { status: "in_progress", stream_id: streamId, provider_call_id: callId, error: "" }),
        recordTelephonyEvent({
          session,
          eventType: "stream.connected",
          idempotencyKey: `stream:${session.id}:${streamId}`,
          providerCallId: callId,
        }),
      ]).catch(() => {
        if (plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1011, "Stream persistence unavailable");
        void finish("Telephony stream state could not be persisted.");
      });
      requestGreeting();
      return;
    }
    if (eventType === "media" && plivoStarted && !dncRequested && realtimeSocket.readyState === WebSocket.OPEN) {
      const media = event.media && typeof event.media === "object" ? event.media as Record<string, unknown> : {};
      const payload = audioPayload(media.payload, 64 * 1024);
      if (payload && (media.track === undefined || media.track === "inbound")) {
        if (!sendJson(realtimeSocket, { type: "input_audio_buffer.append", audio: payload })) {
          plivoSocket.close(1013, "Voice inference backpressure limit reached");
          void finish("Realtime audio input exceeded the backpressure limit.");
        }
      }
      return;
    }
    if (eventType === "dtmf" && streamId) {
      const dtmf = event.dtmf && typeof event.dtmf === "object" ? event.dtmf as Record<string, unknown> : {};
      if (dtmf.digit === "*" && plivoSocket.readyState === WebSocket.OPEN) {
        sendJson(plivoSocket, { event: "clearAudio", streamId });
        sendJson(realtimeSocket, { type: "response.cancel" });
      }
      return;
    }
    if (eventType === "stop" && plivoSocket.readyState === WebSocket.OPEN) plivoSocket.close(1000, "Stream stopped");
  };
  plivoSocket.on("message", handlePlivoMessage);
  plivoSocket.off("message", bufferPendingPlivoMessage);
  for (const message of pendingPlivoMessages) handlePlivoMessage(message.data, message.isBinary);
  pendingPlivoMessages.length = 0;
  plivoSocket.on("close", () => { void finish(); });
  plivoSocket.on("error", () => { void finish("Plivo audio stream disconnected unexpectedly."); });
  return done;
}

async function main() {
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();
await app.prepare();
const upgradeHandler = app.getUpgradeHandler();

const server = createServer((request, response) => handler(request, response));
const voiceServer = new WebSocketServer({ noServer: true, maxPayload: 1_000_000, perMessageDeflate: false });
const liveness = new WeakMap<WebSocket, boolean>();

voiceServer.on("connection", (socket, request) => {
  liveness.set(socket, true);
  socket.on("pong", () => liveness.set(socket, true));
  const url = new URL(request.url || "/", `http://${header(request, "host") || "127.0.0.1"}`);
  const token = verifyPlivoStreamToken(url.searchParams.get("token") || "", process.env.PLIVO_STREAM_SECRET || "");
  if (!token) return socket.close(1008, "Unauthorized");
  void bridgeConnection(socket, token).catch(() => socket.close(1011, "Voice bridge unavailable"));
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${header(request, "host") || "127.0.0.1"}`);
  if (url.pathname !== voicePath) return upgradeHandler(request, socket, head);
  const token = verifyPlivoStreamToken(url.searchParams.get("token") || "", process.env.PLIVO_STREAM_SECRET || "");
  if (!token) return rejectUpgrade(socket, 401, "Unauthorized");
  if (!validPlivoUpgrade(request)) return rejectUpgrade(socket, 401, "Unauthorized");
  if (voiceServer.clients.size >= maxVoiceConnections) return rejectUpgrade(socket, 503, "Voice capacity reached");
  voiceServer.handleUpgrade(request, socket, head, (webSocket) => voiceServer.emit("connection", webSocket, request));
});

const heartbeat = setInterval(() => {
  for (const socket of voiceServer.clients) {
    if (!liveness.get(socket)) socket.terminate();
    else {
      liveness.set(socket, false);
      socket.ping();
    }
  }
}, 30_000);

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(port, hostname, () => console.log(`BuildStax listening on http://${hostname}:${port}`));

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  for (const socket of voiceServer.clients) {
    if (dev) socket.terminate();
    else socket.close(1001, "Server shutting down");
  }
  if (dev) server.closeAllConnections?.();
  await Promise.all([
    new Promise<void>((resolve) => server.close(() => resolve())),
    app.close(),
  ]).catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
}

void main().catch((error: unknown) => {
  console.error("BuildStax failed to start.", error);
  process.exit(1);
});
