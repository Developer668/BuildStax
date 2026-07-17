import { describe, expect, it } from "vitest";
import {
  audioPayload,
  boundedCallSeconds,
  isDoNotCallRequest,
  resolveRealtimeSettings,
  safeVoiceText,
} from "./voice-protocol";

describe("voice protocol safeguards", () => {
  it("bounds call duration even when configuration is invalid", () => {
    expect(boundedCallSeconds(undefined)).toBe(900);
    expect(boundedCallSeconds("NaN")).toBe(900);
    expect(boundedCallSeconds("1")).toBe(60);
    expect(boundedCallSeconds("9000")).toBe(3600);
  });

  it("restricts realtime credentials to explicitly allowed public providers", () => {
    expect(resolveRealtimeSettings({ OPENAI_API_KEY: "sk-test-value" })).toMatchObject({
      model: "gpt-realtime",
      url: "wss://api.openai.com/v1/realtime?model=gpt-realtime",
    });
    expect(() => resolveRealtimeSettings({
      OPENAI_API_KEY: "sk-test-value",
      VOICE_AGENT_WS_URL: "wss://attacker.example/v1/realtime",
    })).toThrow(/allowlist/);
    expect(() => resolveRealtimeSettings({
      VOICE_AGENT_API_KEY: "provider-test-value",
      VOICE_AGENT_WS_URL: "wss://127.0.0.1/realtime",
      VOICE_AGENT_ALLOWED_WS_HOSTS: "127.0.0.1",
    })).toThrow(/public WSS|invalid host/);
    expect(() => resolveRealtimeSettings({
      OPENAI_API_KEY: "sk-test-value",
      VOICE_AGENT_WS_URL: "wss://voice.example.com/realtime",
      VOICE_AGENT_ALLOWED_WS_HOSTS: "voice.example.com",
    })).toThrow(/credential/);
    expect(resolveRealtimeSettings({
      VOICE_AGENT_API_KEY: "provider-test-value",
      VOICE_AGENT_WS_URL: "wss://voice.example.com/realtime",
      VOICE_AGENT_ALLOWED_WS_HOSTS: "voice.example.com",
    }).url).toBe("wss://voice.example.com/realtime");
  });

  it("accepts bounded base64 audio and rejects malformed payloads", () => {
    expect(audioPayload("AQIDBA==")).toBe("AQIDBA==");
    expect(audioPayload("not base64")) .toBeNull();
    expect(audioPayload("a".repeat(300_000))).toBeNull();
  });

  it("detects explicit do-not-call requests without matching ordinary phrasing", () => {
    expect(isDoNotCallRequest("Please don't call me again.")).toBe(true);
    expect(isDoNotCallRequest("Take this number off your calling list.")).toBe(true);
    expect(isDoNotCallRequest("Do not call this project a redesign.")).toBe(false);
    expect(isDoNotCallRequest("I can take a call again tomorrow.")).toBe(false);
  });

  it("removes control characters from persisted voice text", () => {
    expect(safeVoiceText("hello\u0000\nworld")).toBe("hello world");
  });
});
