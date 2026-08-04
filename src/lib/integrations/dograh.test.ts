import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dograhLocalCallConfig, isDograhLocalCallsEnabled, dograhCspOrigins } = await import("./dograh");

const base = {
  NODE_ENV: "development",
  DOGRAH_LOCAL_CALLS_ENABLED: "true",
  DOGRAH_WIDGET_SCRIPT_URL: "http://localhost:3010/dograh-widget.js",
} as const;

describe("isDograhLocalCallsEnabled", () => {
  it("is enabled in development with the flag and a script URL", () => {
    expect(isDograhLocalCallsEnabled(base)).toBe(true);
  });

  it("is disabled in production even when fully configured", () => {
    expect(isDograhLocalCallsEnabled({ ...base, NODE_ENV: "production" })).toBe(false);
    expect(isDograhLocalCallsEnabled({ ...base, APP_MODE: "production" })).toBe(false);
  });

  it("is disabled when the flag is not exactly 'true'", () => {
    expect(isDograhLocalCallsEnabled({ ...base, DOGRAH_LOCAL_CALLS_ENABLED: "1" })).toBe(false);
    expect(isDograhLocalCallsEnabled({ ...base, DOGRAH_LOCAL_CALLS_ENABLED: undefined })).toBe(false);
  });

  it("is disabled without a widget script URL", () => {
    expect(isDograhLocalCallsEnabled({ ...base, DOGRAH_WIDGET_SCRIPT_URL: "  " })).toBe(false);
  });
});

describe("dograhLocalCallConfig", () => {
  it("returns the embed config when enabled and derives the origin from the script URL", () => {
    const config = dograhLocalCallConfig(base);
    expect(config.enabled).toBe(true);
    expect(config.scriptUrl).toBe("http://localhost:3010/dograh-widget.js");
    expect(config.origin).toBe("http://localhost:3010");
  });

  it("prefers an explicit DOGRAH_ORIGIN over the derived one", () => {
    const config = dograhLocalCallConfig({ ...base, DOGRAH_ORIGIN: "http://127.0.0.1:3010" });
    expect(config.origin).toBe("http://127.0.0.1:3010");
  });

  it("parses widget attributes and drops unsafe keys / non-string values", () => {
    const config = dograhLocalCallConfig({
      ...base,
      DOGRAH_WIDGET_ATTRS: JSON.stringify({
        "data-agent-id": "abc123",
        "data-mode": "inline",
        "bad key": "x",
        "data-count": 5,
      }),
    });
    expect(config.attrs).toEqual({ "data-agent-id": "abc123", "data-mode": "inline" });
  });

  it("returns empty attrs for malformed JSON", () => {
    const config = dograhLocalCallConfig({ ...base, DOGRAH_WIDGET_ATTRS: "{not json" });
    expect(config.attrs).toEqual({});
  });

  it("returns an inert config with no embed details when disabled", () => {
    const config = dograhLocalCallConfig({ ...base, NODE_ENV: "production", DOGRAH_WIDGET_ATTRS: JSON.stringify({ "data-agent-id": "abc" }) });
    expect(config).toEqual({ enabled: false, scriptUrl: "", attrs: {}, origin: "" });
  });
});

describe("dograhCspOrigins", () => {
  it("is empty when disabled", () => {
    expect(dograhCspOrigins({ ...base, DOGRAH_LOCAL_CALLS_ENABLED: "false" })).toEqual([]);
  });

  it("includes the http origin and its ws variant", () => {
    expect(dograhCspOrigins(base)).toEqual(["http://localhost:3010", "ws://localhost:3010"]);
  });

  it("includes the https origin and its wss variant", () => {
    expect(dograhCspOrigins({ ...base, DOGRAH_ORIGIN: "https://voice.example.com" }))
      .toEqual(["https://voice.example.com", "wss://voice.example.com"]);
  });
});
