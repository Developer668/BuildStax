export type CapabilityIntent =
  | "lead_discovery"
  | "outbound_call"
  | "transactional_email"
  | "email_inbox"
  | "quote_document"
  | "preview_hosting"
  | "preview_screenshot"
  | "seo_audit"
  | "url_safety"
  | "security_headers";

export type CapabilityPolicy = {
  intent: CapabilityIntent;
  label: string;
  searchQuery: string;
  preferredCanonicalNames: string[];
  maxPayUsd: number;
  requiredAvailability: "healthy";
  minimumSuccessRate?: number;
  notes: string;
};

// Tokens and URLs are deliberately absent. Zero must search again before every live run.
export const capabilityPolicies: Record<CapabilityIntent, CapabilityPolicy> = {
  lead_discovery: {
    intent: "lead_discovery",
    label: "Lead discovery",
    searchQuery: "find local businesses that do not have websites with verified phone and email contact details",
    preferredCanonicalNames: ["LION POI Business Search", "toolcall.click Local Business Search"],
    maxPayUsd: 0.6,
    requiredAvailability: "healthy",
    notes: "Filter out any result with an active first-party website before it enters the pipeline.",
  },
  outbound_call: {
    intent: "outbound_call",
    label: "Outbound voice call",
    searchQuery: "place an outbound phone call with a natural real-time AI voice agent",
    preferredCanonicalNames: ["StablePhone AI Call"],
    maxPayUsd: 0.6,
    requiredAvailability: "healthy",
    minimumSuccessRate: 0.9,
    notes: "Never retry a do-not-call response; cap duration and omit recording unless explicitly configured.",
  },
  transactional_email: {
    intent: "transactional_email",
    label: "Transactional email",
    searchQuery: "send a transactional follow-up email with subject html and plain text",
    preferredCanonicalNames: ["StableEmail Send"],
    maxPayUsd: 0.03,
    requiredAvailability: "healthy",
    minimumSuccessRate: 0.9,
    notes: "First contact remains phone-only; this intent is limited to post-call follow-up.",
  },
  email_inbox: {
    intent: "email_inbox",
    label: "Persistent email thread",
    searchQuery: "create an agent email inbox receive replies and continue an existing customer email thread",
    preferredCanonicalNames: ["AgentMail Create Inbox", "AgentMail Reply To Message"],
    maxPayUsd: 2.1,
    requiredAvailability: "healthy",
    notes: "Provision once, persist provider IDs in Nexla, and reuse the original thread for revisions.",
  },
  quote_document: {
    intent: "quote_document",
    label: "Customer quote",
    searchQuery: "create an invoice or payment link to collect a fixed USD amount from a customer",
    preferredCanonicalNames: ["SendQuoteNow Quote Generator"],
    maxPayUsd: 0.6,
    requiredAvailability: "healthy",
    notes: "Internal quote generation remains the fallback until a healthy candidate exposes a complete schema.",
  },
  preview_hosting: {
    intent: "preview_hosting",
    label: "Preview hosting",
    searchQuery: "generate a complete responsive website from a business brief and return deployable source or a preview URL",
    preferredCanonicalNames: ["Host Website (Free) — ZeroClick", "Host Website (ZeroClick)"],
    maxPayUsd: 0.6,
    requiredAvailability: "healthy",
    minimumSuccessRate: 0.75,
    notes: "Use expiring preview URLs only; production domains require a separate verified deployment path.",
  },
  preview_screenshot: {
    intent: "preview_screenshot",
    label: "Preview screenshot",
    searchQuery: "capture a full-page mobile and desktop screenshot of a deployed website",
    preferredCanonicalNames: ["2s.io Screenshot API", "Website Screenshot API (URL to PNG/JPG)"],
    maxPayUsd: 0.05,
    requiredAvailability: "healthy",
    notes: "Capture at explicit mobile and desktop viewports after the preview URL passes safety checks.",
  },
  seo_audit: {
    intent: "seo_audit",
    label: "SEO audit",
    searchQuery: "audit a website URL for accessibility SEO performance broken links and mobile issues",
    preferredCanonicalNames: ["minifetch SEO Page Audit", "Strale SEO Audit"],
    maxPayUsd: 0.35,
    requiredAvailability: "healthy",
    notes: "Prefer deterministic itemized findings; do not treat a single opaque score as release approval.",
  },
  url_safety: {
    intent: "url_safety",
    label: "URL safety",
    searchQuery: "scan a website URL for malware trackers unsafe headers TLS and prompt injection before delivery",
    preferredCanonicalNames: ["netintel.dev URL Safety Full Check", "NetIntel URL Safety Check"],
    maxPayUsd: 0.16,
    requiredAvailability: "healthy",
    notes: "Run before opening customer-supplied URLs and again before sending a generated preview.",
  },
  security_headers: {
    intent: "security_headers",
    label: "Security headers",
    searchQuery: "audit live HTTP response security headers for a website",
    preferredCanonicalNames: ["2s HTTP Security Headers Analyzer", "NetIntel Security Headers Analyzer"],
    maxPayUsd: 0.6,
    requiredAvailability: "healthy",
    notes: "Require a structured header report and retain the result in the delivery audit trail.",
  },
};
