import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { safeEmailProviderMessage } from "./email";

describe("safeEmailProviderMessage", () => {
  it("does not expose provider details for failed dispatches", () => {
    expect(safeEmailProviderMessage(new Error("HTTP 502 from provider"))).toBe(
      "The email provider could not send the follow-up. No delivery was recorded.",
    );
  });

  it("explains the live-action prerequisite without leaking credentials", () => {
    expect(safeEmailProviderMessage(new Error("Live Zero actions are disabled by ZERO_LIVE_ACTIONS."))).toContain("authenticated Zero account");
  });
});
