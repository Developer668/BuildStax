export const businessStages = [
  "discovered",
  "qualified",
  "call_ready",
  "contacted",
  "interested",
  "quoted",
  "payment_pending",
  "paid",
  "building",
  "review",
  "delivered",
  "won",
  "lost",
  "dnc",
] as const;

export type BusinessStage = (typeof businessStages)[number];

export const activePipelineStages: BusinessStage[] = [
  "discovered",
  "qualified",
  "call_ready",
  "contacted",
  "interested",
  "quoted",
  "payment_pending",
  "paid",
  "building",
  "review",
  "delivered",
];

export const stageMeta: Record<
  BusinessStage,
  { label: string; shortLabel: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }
> = {
  discovered: { label: "Discovered", shortLabel: "New", tone: "neutral" },
  qualified: { label: "Qualified", shortLabel: "Qualified", tone: "info" },
  call_ready: { label: "Ready to call", shortLabel: "Call ready", tone: "info" },
  contacted: { label: "Contacted", shortLabel: "Contacted", tone: "warning" },
  interested: { label: "Interested", shortLabel: "Interested", tone: "success" },
  quoted: { label: "Quote sent", shortLabel: "Quoted", tone: "warning" },
  payment_pending: { label: "Payment pending", shortLabel: "Payment", tone: "warning" },
  paid: { label: "Paid", shortLabel: "Paid", tone: "success" },
  building: { label: "In build", shortLabel: "Building", tone: "info" },
  review: { label: "Customer review", shortLabel: "Review", tone: "warning" },
  delivered: { label: "Delivered", shortLabel: "Delivered", tone: "success" },
  won: { label: "Complete", shortLabel: "Won", tone: "success" },
  lost: { label: "Closed lost", shortLabel: "Lost", tone: "danger" },
  dnc: { label: "Do not call", shortLabel: "DNC", tone: "danger" },
};

const transitionMap: Record<BusinessStage, readonly BusinessStage[]> = {
  discovered: ["qualified", "call_ready", "lost", "dnc"],
  qualified: ["call_ready", "contacted", "lost", "dnc"],
  call_ready: ["contacted", "interested", "lost", "dnc"],
  contacted: ["call_ready", "interested", "lost", "dnc"],
  interested: ["quoted", "lost", "dnc"],
  quoted: ["payment_pending", "paid", "interested", "lost", "dnc"],
  payment_pending: ["paid", "quoted", "lost", "dnc"],
  paid: ["building"],
  building: ["review"],
  review: ["building", "delivered"],
  delivered: ["review", "won"],
  won: ["review"],
  lost: ["qualified", "dnc"],
  dnc: [],
};

const actionManagedStages = new Set<BusinessStage>([
  "contacted",
  "interested",
  "quoted",
  "payment_pending",
  "paid",
  "building",
  "review",
  "delivered",
  "won",
]);

export function canTransitionStage(from: BusinessStage, to: BusinessStage) {
  return from === to || transitionMap[from].includes(to);
}

export function getAllowedStageTransitions(stage: BusinessStage) {
  return transitionMap[stage];
}

export function canManuallyTransitionStage(from: BusinessStage, to: BusinessStage) {
  return canTransitionStage(from, to) && !actionManagedStages.has(to);
}

export function getAllowedManualStageTransitions(stage: BusinessStage) {
  return transitionMap[stage].filter((candidate) => !actionManagedStages.has(candidate));
}

export function calculatePriceFloor(estimatedCostCents: number, configuredFloorCents: number) {
  const multiplierFloorCents = estimatedCostCents * 2;
  return {
    multiplierFloorCents,
    configuredFloorCents,
    enforcedFloorCents: Math.max(multiplierFloorCents, configuredFloorCents),
  };
}

export function nextStageForCallOutcome(outcome: string): BusinessStage {
  switch (outcome) {
    case "interested":
      return "interested";
    case "follow_up":
    case "no_answer":
      return "contacted";
    case "not_interested":
      return "lost";
    case "do_not_call":
      return "dnc";
    default:
      return "contacted";
  }
}

export function stageAfterCallOutcome(current: BusinessStage, outcome: string) {
  const target = nextStageForCallOutcome(outcome);
  return canTransitionStage(current, target) ? target : current;
}

export function nextProjectStage(status: string): { projectStatus: string; businessStage: BusinessStage } | null {
  switch (status) {
    case "queued":
      return { projectStatus: "building", businessStage: "building" };
    case "building":
      return { projectStatus: "review", businessStage: "review" };
    case "review":
      return { projectStatus: "delivered", businessStage: "delivered" };
    case "delivered":
      return { projectStatus: "complete", businessStage: "won" };
    default:
      return null;
  }
}
