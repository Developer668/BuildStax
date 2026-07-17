import { describe, expect, it } from "vitest";
import {
  calculatePriceFloor,
  canManuallyTransitionStage,
  canTransitionStage,
  getAllowedManualStageTransitions,
  getAllowedStageTransitions,
  nextProjectStage,
  nextStageForCallOutcome,
  stageAfterCallOutcome,
} from "./domain";

describe("pricing floor", () => {
  it("uses twice the estimated cost when it is higher", () => {
    expect(calculatePriceFloor(90_000, 150_000)).toEqual({
      multiplierFloorCents: 180_000,
      configuredFloorCents: 150_000,
      enforcedFloorCents: 180_000,
    });
  });

  it("uses the configured floor when it is higher", () => {
    expect(calculatePriceFloor(60_000, 150_000).enforcedFloorCents).toBe(150_000);
  });
});

describe("pipeline transitions", () => {
  it("allows the approved forward workflow", () => {
    expect(canTransitionStage("interested", "quoted")).toBe(true);
    expect(canTransitionStage("paid", "building")).toBe(true);
    expect(canTransitionStage("review", "delivered")).toBe(true);
  });

  it("blocks skipping payment and any transition out of DNC", () => {
    expect(canTransitionStage("quoted", "building")).toBe(false);
    expect(canTransitionStage("dnc", "qualified")).toBe(false);
    expect(getAllowedStageTransitions("dnc")).toEqual([]);
  });

  it("reserves evidence-backed stages for their dedicated actions", () => {
    expect(canManuallyTransitionStage("interested", "quoted")).toBe(false);
    expect(canManuallyTransitionStage("quoted", "paid")).toBe(false);
    expect(canManuallyTransitionStage("discovered", "call_ready")).toBe(true);
    expect(getAllowedManualStageTransitions("call_ready")).toEqual(["lost", "dnc"]);
  });

  it("maps call outcomes to accountable stages", () => {
    expect(nextStageForCallOutcome("interested")).toBe("interested");
    expect(nextStageForCallOutcome("no_answer")).toBe("contacted");
    expect(nextStageForCallOutcome("do_not_call")).toBe("dnc");
    expect(stageAfterCallOutcome("call_ready", "interested")).toBe("interested");
    expect(stageAfterCallOutcome("quoted", "no_answer")).toBe("quoted");
  });
});

describe("project progression", () => {
  it("requires review before delivery", () => {
    expect(nextProjectStage("building")).toEqual({ projectStatus: "review", businessStage: "review" });
    expect(nextProjectStage("review")).toEqual({ projectStatus: "delivered", businessStage: "delivered" });
    expect(nextProjectStage("complete")).toBeNull();
  });
});
