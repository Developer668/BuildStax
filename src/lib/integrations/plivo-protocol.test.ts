import { describe, expect, it } from "vitest";
import {
  buildPlivoStreamXml,
  createPlivoStreamToken,
  normalizeE164,
  normalizePlivoE164,
  plivoStreamUrl,
  publicRequestUrlCandidates,
  readPlivoForm,
  verifyPlivoStreamToken,
} from "./plivo-protocol";

const secret = "a".repeat(64);
const issuedAt = Date.UTC(2026, 6, 17, 20, 0, 0);

describe("Plivo stream protocol", () => {
  it("creates a short-lived signed token and rejects tampering or expiry", () => {
    const token = createPlivoStreamToken({
      sessionId: "tel_12345678-1234-1234-1234-123456789abc",
      callId: "call-12345678",
      direction: "outbound",
    }, secret, issuedAt, 120);
    expect(verifyPlivoStreamToken(token, secret, issuedAt + 30_000)).toMatchObject({
      sessionId: "tel_12345678-1234-1234-1234-123456789abc",
      callId: "call-12345678",
      direction: "outbound",
    });
    expect(verifyPlivoStreamToken(`${token}x`, secret, issuedAt + 30_000)).toBeNull();
    expect(verifyPlivoStreamToken(token, secret, issuedAt + 200_000)).toBeNull();
    expect(() => createPlivoStreamToken({
      sessionId: "tel_12345678-1234-1234-1234-123456789abc",
      callId: "call-12345678",
      direction: "outbound",
    }, secret, issuedAt, 600)).toThrow(/lifetime/);
  });

  it("normalizes safe E.164 input and rejects ambiguous destinations", () => {
    expect(normalizeE164("+1 (330) 737-7690")).toBe("+13307377690");
    expect(() => normalizeE164("330-737-7690")).toThrow(/E\.164/);
    expect(() => normalizeE164("+00000000")).toThrow(/E\.164/);
    expect(normalizePlivoE164("13307377690")).toBe("+13307377690");
    expect(normalizePlivoE164("+13307377690")).toBe("+13307377690");
  });

  it("builds escaped bidirectional PCMU XML", () => {
    const stream = plivoStreamUrl("https://voice.example.com", "abc&123");
    const xml = buildPlivoStreamXml(stream, "https://voice.example.com/events?a=1&b=2", "tel_12345678-1234-1234-1234-123456789abc");
    expect(stream).toBe("wss://voice.example.com/voice/plivo?token=abc%26123");
    expect(xml).toContain('bidirectional="true"');
    expect(xml).toContain('contentType="audio/x-mulaw;rate=8000"');
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).toContain("token=abc%26123");
  });

  it("uses only the configured canonical WebSocket URL when one is available", () => {
    const candidates = publicRequestUrlCandidates({
      requestUrl: "http://127.0.0.1:3000/voice/plivo?token=x",
      forwardedHost: "voice.example.com",
      forwardedProto: "https",
      configuredBaseUrl: "https://buildstax.example.com",
      webSocket: true,
    });
    expect(candidates).toEqual(["wss://buildstax.example.com/voice/plivo?token=x"]);
  });

  it("bounds and parses Plivo form bodies without accepting duplicate fields", async () => {
    const request = new Request("https://voice.example.com/events", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "CallUUID=call-12345678&Event=StartStream",
    });
    await expect(readPlivoForm(request)).resolves.toEqual({ CallUUID: "call-12345678", Event: "StartStream" });

    const duplicate = new Request("https://voice.example.com/events", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "CallUUID=one&CallUUID=two",
    });
    await expect(readPlivoForm(duplicate)).rejects.toMatchObject({ status: 400 });

    const oversized = new Request("https://voice.example.com/events", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "70000" },
      body: "Event=StartStream",
    });
    await expect(readPlivoForm(oversized)).rejects.toMatchObject({ status: 413 });
  });
});
