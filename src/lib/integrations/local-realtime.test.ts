import { describe, expect, it } from "vitest";
import { buildLocalRealtimeSession, isValidLocalSdp, localCallInstructions } from "./local-realtime";

const environment = {
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_REALTIME_MODEL: "gpt-realtime-2.1-mini",
  OPENAI_REALTIME_VOICE: "marin",
};

describe("local realtime calls", () => {
  it("builds a two-way audio session with interruption and transcription", () => {
    const session = buildLocalRealtimeSession(environment);
    expect(session).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1-mini",
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
          turn_detection: { type: "semantic_vad", create_response: true, interrupt_response: true },
        },
        output: { voice: "marin" },
      },
    });
  });

  it("keeps the local agent focused on a confirmed website brief", () => {
    const instructions = localCallInstructions(environment);
    expect(instructions).toContain("website brief");
    expect(instructions).toContain("one concise question at a time");
    expect(instructions).toContain("Do not collect payment card details");
  });

  it("accepts SDP offers and rejects unrelated or oversized input", () => {
    expect(isValidLocalSdp("v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n")).toBe(true);
    expect(isValidLocalSdp("not sdp")).toBe(false);
    expect(isValidLocalSdp(`v=0\n${"x".repeat(70_000)}`)).toBe(false);
  });
});
