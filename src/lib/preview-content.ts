export type PreviewContent = {
  image: string;
  imageAlt: string;
  kicker: string;
  headline: string;
  intro: string;
  services: Array<[string, string]>;
  projectTitle: string;
  projectCopy: string;
  cta: string;
  principles: string[];
  surface: string;
  approachSurface: string;
  primaryAction: string;
};

export type PreviewDirection = {
  brief?: string | null;
  preferredStyle?: string | null;
};

const defaultTheme = {
  approachSurface: "bg-[#172018]",
  primaryAction: "bg-[#172018] text-white hover:bg-[#2a352b]",
};

export function getPreviewContent(category: string, location: string, direction: PreviewDirection = {}): PreviewContent {
  const normalized = category.toLowerCase();
  const kicker = `${category} · ${location}`;

  if (/landscap|garden/.test(normalized)) {
    return applyCustomerDirection({
      image: "/images/tide-timber-garden.png",
      imageAlt: "Drought-aware East Bay garden with native grasses, olive trees, pale stone paths, and a dark timber home",
      kicker,
      headline: "Gardens with a sense of place.",
      intro: "Thoughtful residential landscapes shaped around California light, low-water planting, and the way you want to live outside.",
      services: [
        ["Garden design", "A complete planting and material plan grounded in your home, site, and maintenance goals."],
        ["Water-wise planting", "Layered climate-ready gardens that feel abundant without excessive irrigation."],
        ["Installation stewardship", "Clear coordination from site preparation through planting, finish work, and handoff."],
      ],
      projectTitle: "A quieter kind of California garden",
      projectCopy: "Warm stone, soft grasses, and drought-aware structure turn an exposed yard into a sequence of useful outdoor rooms.",
      cta: "Plan a consultation",
      principles: ["A plan grounded in your site", "Clear materials and maintenance choices", "One accountable installation handoff"],
      surface: "bg-[#f2f2ec] text-[#172018]",
      ...defaultTheme,
    }, direction);
  }

  if (/bicycle|bike|cycle|repair/.test(normalized)) {
    return applyCustomerDirection({
      image: "/images/cypress-bicycle-repair.png",
      imageAlt: "Bicycle mechanic tuning a green commuter bike in an organized neighborhood repair workshop",
      kicker,
      headline: "Straight answers. Reliable repairs.",
      intro: "Practical bicycle service with a clear diagnosis, an agreed price, and timing you can plan around.",
      services: [
        ["Tune-ups", "Safety checks, shifting and brake adjustments, wheel inspection, and a clear list of anything that needs attention."],
        ["Brake and drivetrain", "Focused repairs for worn pads, noisy drivetrains, slipping gears, and everyday commuter wear."],
        ["Flats and quick fixes", "Fast help for punctures, tire replacement, loose components, and small adjustments that keep you moving."],
      ],
      projectTitle: "Service you can understand before work begins",
      projectCopy: "Every bicycle gets a practical assessment, an explained scope, and a dependable pickup plan without surprise work added at the counter.",
      cta: "Request a repair",
      principles: ["Diagnosis before replacement", "Approval before added work", "A clear pickup and handoff"],
      surface: "bg-[#f4f5ef] text-[#172018]",
      ...defaultTheme,
    }, direction);
  }

  if (/yoga|pilates|wellness/.test(normalized)) {
    return applyCustomerDirection({
      image: "/images/ember-yoga-studio.png",
      imageAlt: "Inclusive small morning yoga class practicing in a bright neighborhood studio",
      kicker,
      headline: "Practice that meets you where you are.",
      intro: "Small, welcoming classes with clear guidance, thoughtful pacing, and room to build a sustainable practice.",
      services: [
        ["Foundations", "Accessible classes for new and returning students who want steady instruction and useful modifications."],
        ["Flow classes", "Balanced movement, strength, and mobility taught with clear options for different experience levels."],
        ["Private sessions", "One-to-one guidance shaped around your goals, schedule, and current range of movement."],
      ],
      projectTitle: "A studio where attention comes first",
      projectCopy: "Experienced instruction, smaller class sizes, and a calm room make it easier to focus on how each movement actually feels.",
      cta: "Find a class",
      principles: ["Clear options in every class", "Respect for different bodies", "Simple booking and arrival details"],
      surface: "bg-[#f5f3ee] text-[#172018]",
      ...defaultTheme,
    }, direction);
  }

  if (/bookkeep|account|tax|finance/.test(normalized)) {
    return applyCustomerDirection({
      image: "/images/juniper-bookkeeping.png",
      imageAlt: "Independent bookkeeper reviewing organized reports with a small-business owner in a bright office",
      kicker,
      headline: "Know where the numbers stand.",
      intro: "Dependable bookkeeping for independent businesses that need clean records, timely reporting, and fewer loose ends.",
      services: [
        ["Monthly bookkeeping", "Consistent categorization, reconciliation, and reporting that keeps the books current."],
        ["Catch-up work", "A structured path from overdue or disorganized records to a reliable current-year ledger."],
        ["Owner reporting", "Plain-language monthly summaries that make cash flow, expenses, and open questions easier to act on."],
      ],
      projectTitle: "Orderly books without the mystery",
      projectCopy: "A repeatable close process and an accountable monthly handoff give owners a clean view of the business without burying them in jargon.",
      cta: "Schedule a review",
      principles: ["A consistent monthly close", "Questions surfaced early", "Confidential, practical handoff"],
      surface: "bg-[#f2f5f3] text-[#172018]",
      ...defaultTheme,
    }, direction);
  }

  if (/pet|groom|dog/.test(normalized)) {
    return applyCustomerDirection({
      image: "/images/new-leaf-grooming.png",
      imageAlt: "Freshly groomed dog standing calmly with a groomer in a clean mint-green studio",
      kicker,
      headline: "Care that keeps them comfortable.",
      intro: "Calm, considered grooming for dogs who deserve an appointment built around their coat, comfort, and routine.",
      services: [
        ["Full groom", "A coat-specific bath, dry, brush, haircut, nail trim, and finishing care."],
        ["Bath and tidy", "Freshen the coat and high-maintenance areas between full grooming appointments."],
        ["First visits", "A slower introduction for puppies and dogs learning to feel at ease in the studio."],
      ],
      projectTitle: "A calm visit from hello to handoff",
      projectCopy: "Clear timing, humane handling, and a quiet studio help every appointment feel predictable for pets and their people.",
      cta: "Request an appointment",
      principles: ["One accountable point of contact", "A clear service scope", "Practical handoff and aftercare"],
      surface: "bg-[#f1f7f2] text-[#172018]",
      ...defaultTheme,
    }, direction);
  }

  return applyCustomerDirection({
    image: "/images/juniper-bookkeeping.png",
    imageAlt: "Independent service professional meeting with a customer in a bright, organized workspace",
    kicker,
    headline: "Professional work, made easier to start.",
    intro: `Clear ${category.toLowerCase()} services, straightforward next steps, and one reliable point of contact.`,
    services: [
      ["Focused service", "A clearly explained scope shaped around the work you actually need."],
      ["Practical planning", "Timing, responsibilities, and decisions made visible before work begins."],
      ["Accountable delivery", "One point of contact from the first conversation through the final handoff."],
    ],
    projectTitle: "A simpler path from question to completed work",
    projectCopy: "Useful information, clear expectations, and direct contact details help customers take the next step with confidence.",
    cta: "Start a conversation",
    principles: ["A scope you can understand", "Clear timing and next steps", "Practical handoff and follow-through"],
    surface: "bg-[#f2f5f3] text-[#172018]",
    ...defaultTheme,
  }, direction);
}

function applyCustomerDirection(content: PreviewContent, direction: PreviewDirection): PreviewContent {
  const brief = normalizePublicCopy(direction.brief, 700);
  const style = normalizePublicCopy(direction.preferredStyle, 300).toLowerCase();
  const theme = preferredTheme(style);
  return {
    ...content,
    ...(brief ? { projectCopy: brief } : {}),
    ...theme,
  };
}

function normalizePublicCopy(value: string | null | undefined, maxLength: number) {
  if (!value) return "";
  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  const shortened = normalized.slice(0, maxLength - 1).trimEnd();
  return `${shortened}…`;
}

function preferredTheme(style: string): Partial<Pick<PreviewContent, "surface" | "approachSurface" | "primaryAction">> {
  if (/warm|welcoming|friendly|soft/.test(style)) {
    return {
      surface: "bg-[#f7f2ec] text-[#211d19]",
      approachSurface: "bg-[#304239]",
      primaryAction: "bg-[#304239] text-white hover:bg-[#40564a]",
    };
  }
  if (/bold|energetic|vibrant|high contrast/.test(style)) {
    return {
      surface: "bg-[#f2f4f7] text-[#171b24]",
      approachSurface: "bg-[#202b46]",
      primaryAction: "bg-[#202b46] text-white hover:bg-[#2d3c61]",
    };
  }
  if (/minimal|clean|modern|calm/.test(style)) {
    return {
      surface: "bg-white text-[#171b1c]",
      approachSurface: "bg-[#1d292b]",
      primaryAction: "bg-[#1d292b] text-white hover:bg-[#304044]",
    };
  }
  return {};
}
