import { describe, expect, it } from "vitest";
import {
  buildVoiceSalesInstructions,
  classifyVoiceSalesOutcome,
  detectVoiceSalesSignals,
  formatVoicePrice,
  voiceSalesGreeting,
  type VoiceSalesContext,
} from "./voice-sales";

const context: VoiceSalesContext = {
  direction: "inbound",
  name: "New phone inquiry",
  category: "Landscaping",
  location: "San Jose",
  contactName: "",
  email: "",
  requirements: "",
  preferredStyle: "",
  websiteStatus: "none",
  sourceRef: "",
  offerPriceCents: 180_000,
  enforcedFloorCents: 180_000,
  estimatedCostCents: 90_000,
  currency: "USD",
  timezone: "America/Los_Angeles",
};

describe("voice sales playbook", () => {
  it("carries the proven staged sales and safety contract into Realtime", () => {
    const instructions = buildVoiceSalesInstructions(context, {});
    expect(instructions).toContain("opener -> permission_check -> discovery");
    expect(instructions).toContain("$1,800");
    expect(instructions).toContain("read the address back slowly");
    expect(instructions).toContain("schedule_website_callback");
    expect(instructions).toContain("secure Stripe Checkout");
    expect(instructions).toContain("Never claim BuildStax found or cold-called them");
    expect(voiceSalesGreeting()).toContain("AI website specialist");
  });

  it("detects the high-value live call states", () => {
    expect(detectVoiceSalesSignals("I'm with a client, call me tomorrow")).toMatchObject({ stage: "callback", busy: true, callback: true });
    expect(detectVoiceSalesSignals("How much does it cost?")).toMatchObject({ stage: "pricing", pricing: true });
    expect(detectVoiceSalesSignals("Is this an AI bot?")).toMatchObject({ stage: "objection", aiQuestion: true });
    expect(detectVoiceSalesSignals("Email me at owner at acme dot com")).toMatchObject({ stage: "email_capture", emailCandidate: true });
    expect(detectVoiceSalesSignals("Stop calling me")).toMatchObject({ stage: "opt_out", optOut: true });
    expect(detectVoiceSalesSignals("Can you guarantee first-page rankings?")).toMatchObject({ stage: "handoff", unsupported: true });
  });

  it("classifies a durable post-call outcome from tool state and transcript", () => {
    expect(classifyVoiceSalesOutcome({ transcript: "Customer: sounds good", intakeSaved: true })).toBe("interested");
    expect(classifyVoiceSalesOutcome({ transcript: "Customer: tomorrow", callbackScheduled: true })).toBe("follow_up");
    expect(classifyVoiceSalesOutcome({ transcript: "Customer: no thanks", explicitNotInterested: true })).toBe("not_interested");
    expect(classifyVoiceSalesOutcome({ transcript: "", doNotCall: true })).toBe("do_not_call");
    expect(formatVoicePrice(180_000)).toBe("$1,800");
  });
});
