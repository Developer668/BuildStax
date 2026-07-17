import { safeVoiceText } from "./voice-protocol";

export const VOICE_SALES_STAGES = [
  "opener",
  "permission_check",
  "discovery",
  "value_pitch",
  "objection",
  "pricing",
  "close",
  "email_capture",
  "readback_confirm",
  "callback",
  "opt_out",
  "handoff",
] as const;

export type VoiceSalesStage = (typeof VOICE_SALES_STAGES)[number];

export type VoiceSalesContext = {
  direction: "inbound" | "outbound";
  name: string;
  category: string;
  location: string;
  contactName: string;
  email: string;
  requirements: string;
  preferredStyle: string;
  websiteStatus: string;
  sourceRef: string;
  offerPriceCents: number;
  enforcedFloorCents: number;
  estimatedCostCents: number;
  currency: string;
  timezone: string;
};

export type VoiceSalesSignals = {
  stage: VoiceSalesStage;
  busy: boolean;
  skeptical: boolean;
  pricing: boolean;
  aiQuestion: boolean;
  sourceQuestion: boolean;
  sendInfo: boolean;
  alreadyHasWebsite: boolean;
  callback: boolean;
  optOut: boolean;
  unsupported: boolean;
  positiveIntent: boolean;
  notInterested: boolean;
  emailCandidate: boolean;
};

const BUSY = /\b(busy|bad time|not now|can'?t talk|cannot talk|with a client|on a job|driving|make it quick)\b/i;
const SKEPTICAL = /\b(who is this|what is this|why are you calling|scam|spam|legit|trust|cold call)\b/i;
const PRICING = /\b(how much|what(?:'s| is) (?:the )?cost|price|pricing|cost|charge|expensive|budget|discount|cheaper)\b/i;
const AI_QUESTION = /\b(is this|are you|you are|you'?re).{0,30}\b(ai|artificial intelligence|robot|bot|automated|human|real person)\b/i;
const SOURCE_QUESTION = /\b(where|how).{0,20}(?:get|got|find|found).{0,20}(?:my|this).{0,10}(?:number|business)\b/i;
const SEND_INFO = /\b(?:send|email|text).{0,35}\b(?:info|information|details|proposal|quote|something)\b/i;
const ALREADY_HAS_WEBSITE = /\b(?:already have|have|got).{0,20}\b(?:a )?(?:site|website|web page)\b/i;
const CALLBACK = /\b(call (?:me )?(?:back|later)|try (?:me )?(?:later|again)|another time|tomorrow|next week|later today|after lunch)\b/i;
const OPT_OUT = /\b(stop calling|stop contacting|remove me|take me off|do not call|don'?t call|unsubscribe|no more calls|opt out)\b/i;
const UNSUPPORTED = /\b(guarantee(?:d)?.{0,30}(?:revenue|rankings?|first[- ]page)|legal advice|tax advice|medical advice|lawsuit|attorney|wire money|bank account|crypto wallet|fake reviews?)\b/i;
const POSITIVE = /\b(let'?s do it|sounds good|go ahead|i'?m interested|that works|yes,? send|send (?:me )?(?:the )?(?:quote|invoice|payment link)|start (?:the )?(?:site|website|project))\b/i;
const NOT_INTERESTED = /\b(not interested|no thanks|don'?t need it|do not need it|pass on this|not for me)\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b[A-Z0-9._%+-]+\s+at\s+[A-Z0-9-]+(?:\s+dot\s+[A-Z0-9-]+)+\b/i;

export function detectVoiceSalesSignals(value: string): VoiceSalesSignals {
  const text = safeVoiceText(value, 4_000);
  const signals = {
    busy: BUSY.test(text),
    skeptical: SKEPTICAL.test(text),
    pricing: PRICING.test(text),
    aiQuestion: AI_QUESTION.test(text),
    sourceQuestion: SOURCE_QUESTION.test(text),
    sendInfo: SEND_INFO.test(text),
    alreadyHasWebsite: ALREADY_HAS_WEBSITE.test(text),
    callback: CALLBACK.test(text),
    optOut: OPT_OUT.test(text),
    unsupported: UNSUPPORTED.test(text),
    positiveIntent: POSITIVE.test(text),
    notInterested: NOT_INTERESTED.test(text),
    emailCandidate: EMAIL.test(text),
  };
  let stage: VoiceSalesStage = "discovery";
  if (signals.optOut) stage = "opt_out";
  else if (signals.unsupported) stage = "handoff";
  else if (signals.callback) stage = "callback";
  else if (signals.emailCandidate) stage = "email_capture";
  else if (signals.positiveIntent) stage = "close";
  else if (signals.pricing) stage = "pricing";
  else if (signals.busy) stage = "permission_check";
  else if (signals.skeptical || signals.aiQuestion || signals.sourceQuestion || signals.sendInfo || signals.alreadyHasWebsite || signals.notInterested) stage = "objection";
  return { stage, ...signals };
}

export function formatVoicePrice(cents: number, currency = "USD") {
  const amount = Math.max(0, Math.round(cents)) / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString("en-US")}`;
  }
}

export function voiceSalesGreeting() {
  return "Say exactly this first: Hi, you've reached BuildStax. I'm an AI website specialist, and this call may be transcribed so I can prepare your website brief. Is now a good time for a quick conversation? Then stop and listen.";
}

export function buildVoiceSalesInstructions(
  context: VoiceSalesContext,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const offer = formatVoicePrice(context.offerPriceCents, context.currency);
  const floor = formatVoicePrice(context.enforcedFloorCents, context.currency);
  const sourceAnswer = context.direction === "inbound"
    ? "The caller dialed the public BuildStax website line. Never claim BuildStax found or cold-called them."
    : `The number came from public business research${context.sourceRef ? ` recorded as ${safeVoiceText(context.sourceRef, 300)}` : ""}; offer an immediate opt-out.`;
  const configured = safeVoiceText(environment.VOICE_AGENT_INSTRUCTIONS, 8_000);
  return [
    "You are BuildStax's professional AI website sales specialist on a live phone call. Sound warm, calm, specific, and human. Keep most turns to one or two short sentences, ask one question at a time, and stop speaking after each question.",
    "DISCLOSURE: Your first spoken turn must identify you as an AI website specialist and say the call may be transcribed. Never hide that you are automated. If asked whether you are AI, answer yes plainly.",
    "CALL FLOW: Follow opener -> permission_check -> discovery -> value_pitch -> objection_or_pricing -> close -> email_capture -> readback_confirm. Move backward when the caller corrects something. Do not bulldoze through stages.",
    "DISCOVERY: Learn the exact business name, business type, city or service area, main services, current website status, customer questions, desired primary action such as call, book, order, or request a quote, contact name, best email, preferred visual style, and urgency. Ask no more than three discovery questions before explaining the value.",
    `OFFER: Sell a focused BuildStax website that makes the business credible on mobile, explains its services and proof, and gives customers one obvious next action. The current floor-compliant offer is ${offer}. The enforced minimum is ${floor}. You may state ${offer}; never offer, imply, or negotiate a lower price. If the caller pushes below the floor, say scope can be reviewed by a person but the price cannot be promised below ${floor}.`,
    "PAYMENT: Never collect card or bank details on the call. Nothing starts until the caller receives and pays through a secure Stripe Checkout link. Do not say a quote, invoice, email, checkout, website, or domain has been sent or created until the corresponding tool confirms it.",
    "BUSY: Say you can be brief, give one concrete sentence about the website outcome, and ask whether they want one quick question or a callback at a specific day and time. For a callback, confirm the date, time, and timezone, then call schedule_website_callback.",
    "SKEPTICAL OR SCAM: Say the caller controls the decision, no card details are taken by phone, nothing starts without verified Stripe payment, and a human-review path is available.",
    "ALREADY HAS A WEBSITE: Do not attack it. Position BuildStax as a focused conversion page or a clearer mobile customer path that can complement what already exists.",
    "SEND INFORMATION: Ask for the best email, normalize spoken forms such as name at company dot com, read the address back slowly, and ask for an explicit yes. If corrected, repeat the corrected address and confirm again.",
    "POSITIVE INTENT: Confirm the complete website brief and the stated price. Only after the caller explicitly confirms both, call save_business_website_intake with price_acknowledged=true. Never claim the brief is saved before the tool succeeds.",
    "NOT INTERESTED: Do not argue. Acknowledge it once, offer no additional pitch, and end politely. A do-not-call request is different and must be honored immediately.",
    "OPT OUT: If the caller says stop, do not call, remove me, or equivalent, acknowledge in one sentence and end all sales discussion. The transport will persist the do-not-call request.",
    "HUMAN HANDOFF: For legal, tax, medical, guaranteed-results, refund disputes, custom contracts, or anything outside the approved website offer, call request_human_followup, tell the caller a person will review it, and stop making promises.",
    sourceAnswer,
    `CURRENT RECORD: business ${safeVoiceText(context.name, 160)}; category ${safeVoiceText(context.category, 120)}; location ${safeVoiceText(context.location, 160)}; contact ${safeVoiceText(context.contactName || "not yet known", 120)}; email ${safeVoiceText(context.email || "not yet known", 320)}; website status ${safeVoiceText(context.websiteStatus || "unknown", 40)}; existing brief ${safeVoiceText(context.requirements || "none", 1_500)}; style ${safeVoiceText(context.preferredStyle || "not yet known", 500)}.`,
    `CURRENT TIME: ${new Date().toISOString()}. Business timezone: ${safeVoiceText(context.timezone || "UTC", 80)}. Use an explicit ISO date-time with offset when scheduling a callback.`,
    configured,
  ].filter(Boolean).join("\n\n");
}

export function classifyVoiceSalesOutcome(input: {
  transcript: string;
  intakeSaved?: boolean;
  callbackScheduled?: boolean;
  handoffRequested?: boolean;
  explicitNotInterested?: boolean;
  doNotCall?: boolean;
}) {
  if (input.doNotCall) return "do_not_call" as const;
  if (input.explicitNotInterested) return "not_interested" as const;
  if (input.callbackScheduled || input.handoffRequested) return "follow_up" as const;
  if (input.intakeSaved || POSITIVE.test(input.transcript)) return "interested" as const;
  if (!/^Customer:/m.test(input.transcript)) return "no_answer" as const;
  return "follow_up" as const;
}
