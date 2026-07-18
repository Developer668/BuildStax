"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Mic, MicOff, PhoneCall, PhoneOff, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./local-call.module.css";

type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";
type TranscriptLine = { id: string; role: "You" | "BuildStax"; text: string };

const labels: Record<CallState, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  ended: "Call ended",
  error: "Connection error",
};

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LocalCall() {
  const [state, setState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const active = ["connecting", "listening", "thinking", "speaking"].includes(state);

  const addTranscript = useCallback((role: TranscriptLine["role"], text: unknown) => {
    if (typeof text !== "string") return;
    const clean = text.trim();
    if (!clean) return;
    setTranscript((lines) => [...lines, { id: crypto.randomUUID(), role, text: clean }]);
  }, []);

  const disconnect = useCallback((nextState: CallState = "ended") => {
    channelRef.current?.close();
    if (peerRef.current) {
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    setMuted(false);
    setState(nextState);
  }, []);

  useEffect(() => () => disconnect("ended"), [disconnect]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const startCall = async () => {
    setError("");
    setTranscript([]);
    setSeconds(0);
    setState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = event.streams[0];
        void audioRef.current.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("The local voice connection ended unexpectedly.");
          disconnect("error");
        }
      };

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        setState("listening");
        channel.send(JSON.stringify({
          type: "response.create",
          response: {
            instructions: "Greet the caller, identify yourself as BuildStax's AI assistant, and ask what business they want a website for.",
            output_modalities: ["audio"],
          },
        }));
      };
      channel.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as Record<string, unknown>;
          const type = String(event.type || "");
          if (type === "input_audio_buffer.speech_started") setState("listening");
          if (type === "input_audio_buffer.speech_stopped" || type === "response.created") setState("thinking");
          if (type === "response.output_audio.delta") setState("speaking");
          if (type === "response.done") setState("listening");
          if (type === "conversation.item.input_audio_transcription.completed") addTranscript("You", event.transcript);
          if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
            addTranscript("BuildStax", event.transcript);
          }
          if (type === "error") {
            const detail = event.error && typeof event.error === "object" ? String((event.error as Record<string, unknown>).message || "") : "";
            setError(detail || "The Realtime agent reported an error.");
            disconnect("error");
          }
        } catch {
          // Ignore malformed provider events while keeping the audio session alive.
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/local-call/session", {
        method: "POST",
        headers: { "content-type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) throw new Error(await response.text() || "Local call setup failed.");
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (reason) {
      const message = reason instanceof DOMException && reason.name === "NotAllowedError"
        ? "Microphone access is required for a two-way call."
        : reason instanceof Error ? reason.message : "The local call could not start.";
      setError(message);
      disconnect("error");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const copyTranscript = async () => {
    const text = transcript.map((line) => `${line.role}: ${line.text}`).join("\n\n");
    if (text) await navigator.clipboard.writeText(text);
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">BuildStax<span>.</span></Link>
        <div className={styles.localBadge}><span /> Local voice lab</div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.callPanel} aria-labelledby="local-call-title">
          <div className={styles.callHeader}>
            <div>
              <p className="eyebrow">OpenAI Realtime 2.1</p>
              <h1 id="local-call-title">Website intake call</h1>
            </div>
            <span className={styles.timer}>{formatDuration(seconds)}</span>
          </div>

          <div className={styles.agentStage} data-state={state}>
            <div className={styles.signal} aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => <span key={index} style={{ animationDelay: `${index * 45}ms` }} />)}
            </div>
            <div className={styles.statusLine}><span className={styles.statusDot} /> {labels[state]}</div>
            <p>BuildStax website agent</p>
          </div>

          {error ? <div className={styles.error} role="alert">{error}</div> : null}

          <div className={styles.controls}>
            {!active ? (
              <Button variant="dark" size="lg" onClick={startCall} aria-label={state === "ended" || state === "error" ? "Start another local call" : "Start local call"}>
                {state === "ended" || state === "error" ? <RotateCcw /> : <PhoneCall />}
                {state === "ended" || state === "error" ? "Call again" : "Start call"}
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="icon" onClick={toggleMute} title={muted ? "Unmute microphone" : "Mute microphone"} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
                  {muted ? <MicOff /> : <Mic />}
                </Button>
                <Button variant="danger" size="icon" onClick={() => disconnect("ended")} title="End call" aria-label="End call"><PhoneOff /></Button>
              </>
            )}
          </div>

          <div className={styles.deviceStatus}>
            <span><Mic /> {muted ? "Microphone muted" : "Microphone ready"}</span>
            <span><Volume2 /> Speaker output</span>
          </div>
          <audio ref={audioRef} autoPlay playsInline />
        </section>

        <section className={styles.transcriptPanel} aria-labelledby="transcript-title">
          <div className={styles.transcriptHeader}>
            <div><p className="eyebrow">Conversation</p><h2 id="transcript-title">Live transcript</h2></div>
            <Button variant="ghost" size="iconSm" onClick={copyTranscript} disabled={!transcript.length} title="Copy transcript" aria-label="Copy transcript"><Copy /></Button>
          </div>
          <div className={styles.transcript} ref={transcriptRef} aria-live="polite">
            {transcript.length ? transcript.map((line) => (
              <article key={line.id} className={line.role === "You" ? styles.userLine : styles.agentLine}>
                <span>{line.role}</span><p>{line.text}</p>
              </article>
            )) : (
              <div className={styles.emptyTranscript}>
                <PhoneCall />
                <p>The conversation will appear here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
