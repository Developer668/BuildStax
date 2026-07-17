import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

function isoOffset(days: number, hours = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export function seedDatabase(db: BetterSQLite3Database<typeof schema>) {
  if (process.env.APP_MODE === "production" && process.env.SEED_SANDBOX_DATA !== "true") {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: "usr_owner",
        email: process.env.ADMIN_EMAIL ?? "owner@buildstax.local",
        name: process.env.ADMIN_NAME ?? "BuildStax Owner",
        role: "owner",
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          email: process.env.ADMIN_EMAIL ?? "owner@buildstax.local",
          name: process.env.ADMIN_NAME ?? "BuildStax Owner",
        },
      })
      .run();
    seedSettings(db, now);
    return;
  }

  const existing = db.select({ count: sql<number>`count(*)` }).from(schema.campaigns).get();
  if (Number(existing?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(schema.users)
      .values({
        id: "usr_owner",
        email: process.env.ADMIN_EMAIL ?? "operator@buildstax.local",
        name: process.env.ADMIN_NAME ?? "Maya Chen",
        role: "owner",
        createdAt: isoOffset(-35),
      })
      .run();

    tx.insert(schema.campaigns)
      .values({
        id: "cmp_east_bay",
        name: "East Bay independent services",
        vertical: "Independent local services",
        region: "Oakland & Berkeley, CA",
        status: "active",
        dailyLeadLimit: 18,
        dailySpendCapCents: 1800,
        pricingFloorCents: 150000,
        pitchScript:
          "Hi, this is Maya with BuildStax. I noticed your business is easy to recommend locally, but customers do not have a clear website to confirm your hours and services. We build and maintain a focused site for independent businesses. Could I ask two quick questions to see whether it would be useful for you?",
        createdAt: isoOffset(-30),
        updatedAt: isoOffset(-2),
      })
      .run();

    tx.insert(schema.pitchVersions)
      .values([
        {
          id: "pit_direct_value",
          campaignId: "cmp_east_bay",
          label: "Direct value",
          script:
            "Lead with the missing confirmation path: services, hours, trust, then ask two questions before discussing price.",
          status: "active",
          calls: 42,
          positiveOutcomes: 11,
          createdAt: isoOffset(-14),
        },
        {
          id: "pit_social_proof",
          campaignId: "cmp_east_bay",
          label: "Local proof",
          script:
            "Lead with local discoverability and the cost of sending prospects to directories instead of a first-party page.",
          status: "challenger",
          calls: 17,
          positiveOutcomes: 3,
          createdAt: isoOffset(-7),
        },
      ])
      .run();

    tx.insert(schema.businesses)
      .values([
        {
          id: "biz_marlowe",
          campaignId: "cmp_east_bay",
          name: "Marlowe & Pine Cafe",
          category: "Cafe",
          location: "Temescal, Oakland",
          address: "4712 Telegraph Ave, Oakland, CA",
          contactName: "Elena Marlowe",
          phone: "+1 510 555 0142",
          email: "elena@example.test",
          websiteStatus: "none",
          source: "sandbox",
          sourceRef: "Local fixture 01",
          stage: "interested",
          score: 92,
          doNotCall: false,
          estimatedSiteCostCents: 82000,
          requirements: "Menu highlights, current hours, private event inquiry, and clear directions from BART.",
          preferredStyle: "Warm editorial photography with crisp menus and no novelty cafe motifs.",
          nextAction: "Prepare a two-option quote",
          nextActionAt: isoOffset(0, 3),
          lastContactAt: isoOffset(-1),
          createdAt: isoOffset(-11),
          updatedAt: isoOffset(-1),
        },
        {
          id: "biz_northline",
          campaignId: "cmp_east_bay",
          name: "Northline Auto Glass",
          category: "Auto glass repair",
          location: "West Oakland",
          address: "1801 Peralta St, Oakland, CA",
          contactName: "Andre Lewis",
          phone: "+1 510 555 0198",
          email: "andre@example.test",
          websiteStatus: "stale",
          source: "sandbox",
          sourceRef: "Local fixture 02",
          stage: "quoted",
          score: 88,
          doNotCall: false,
          estimatedSiteCostCents: 90000,
          requirements: "Mobile repair coverage map, insurance FAQ, quote request, and same-day availability callout.",
          preferredStyle: "Technical and trustworthy, with clear service zones and strong phone conversion.",
          nextAction: "Follow up on quote",
          nextActionAt: isoOffset(1),
          lastContactAt: isoOffset(-2),
          createdAt: isoOffset(-13),
          updatedAt: isoOffset(-2),
        },
        {
          id: "biz_alder",
          campaignId: "cmp_east_bay",
          name: "Alder Street Dental",
          category: "Family dentistry",
          location: "Berkeley",
          address: "2129 Martin Luther King Jr Way, Berkeley, CA",
          contactName: "Dr. Priya Raman",
          phone: "+1 510 555 0131",
          email: "hello@example.test",
          websiteStatus: "none",
          source: "sandbox",
          sourceRef: "Local fixture 03",
          stage: "call_ready",
          score: 86,
          doNotCall: false,
          estimatedSiteCostCents: 110000,
          requirements: "",
          preferredStyle: "",
          nextAction: "Place first call",
          nextActionAt: isoOffset(0, 1),
          lastContactAt: null,
          createdAt: isoOffset(-7),
          updatedAt: isoOffset(-1),
        },
        {
          id: "biz_tide",
          campaignId: "cmp_east_bay",
          name: "Tide & Timber Landscaping",
          category: "Landscape design",
          location: "Alameda",
          address: "2320 Blanding Ave, Alameda, CA",
          contactName: "Sam Ortega",
          phone: "+1 510 555 0174",
          email: "sam@example.test",
          websiteStatus: "none",
          source: "sandbox",
          sourceRef: "Local fixture 04",
          stage: "review",
          score: 95,
          doNotCall: false,
          estimatedSiteCostCents: 105000,
          requirements:
            "Residential garden design, drought-aware planting, before-and-after portfolio, service area, and consultation request.",
          preferredStyle: "Quiet, tactile, and modern. Real gardens, deep greens, warm stone, no stock-photo handshakes.",
          nextAction: "Review customer feedback",
          nextActionAt: isoOffset(0, 4),
          lastContactAt: isoOffset(-1),
          createdAt: isoOffset(-24),
          updatedAt: isoOffset(-1),
        },
        {
          id: "biz_new_leaf",
          campaignId: "cmp_east_bay",
          name: "New Leaf Pet Grooming",
          category: "Pet grooming",
          location: "Rockridge, Oakland",
          address: "5718 College Ave, Oakland, CA",
          contactName: "Jamie Park",
          phone: "+1 510 555 0166",
          email: "jamie@example.test",
          websiteStatus: "active",
          source: "sandbox",
          sourceRef: "Local fixture 05",
          stage: "won",
          score: 91,
          doNotCall: false,
          estimatedSiteCostCents: 78000,
          requirements: "Services, breed-based timing, booking request, policies, and first-visit checklist.",
          preferredStyle: "Friendly but not childish; mint, black, and warm photography.",
          nextAction: "30-day performance check",
          nextActionAt: isoOffset(12),
          lastContactAt: isoOffset(-4),
          createdAt: isoOffset(-32),
          updatedAt: isoOffset(-4),
        },
        {
          id: "biz_harborview",
          campaignId: "cmp_east_bay",
          name: "Harborview Tailors",
          category: "Alterations",
          location: "Downtown Oakland",
          address: "415 14th St, Oakland, CA",
          contactName: "",
          phone: "+1 510 555 0124",
          email: "",
          websiteStatus: "none",
          source: "sandbox",
          sourceRef: "Local fixture 06",
          stage: "dnc",
          score: 71,
          doNotCall: true,
          estimatedSiteCostCents: 65000,
          requirements: "",
          preferredStyle: "",
          nextAction: "No outreach permitted",
          nextActionAt: null,
          lastContactAt: isoOffset(-6),
          createdAt: isoOffset(-10),
          updatedAt: isoOffset(-6),
        },
      ])
      .run();

    tx.insert(schema.calls)
      .values([
        {
          id: "call_marlowe_1",
          businessId: "biz_marlowe",
          status: "completed",
          outcome: "interested",
          summary: "Elena wants a concise site before autumn event bookings begin. Pricing discussion should include photography as optional.",
          transcript:
            "Elena confirmed that most new customers currently find the cafe through map listings. She wants private event inquiries to stop arriving as unstructured direct messages.",
          durationSeconds: 368,
          provider: "Manual record",
          mode: "manual",
          costCents: 0,
          createdAt: isoOffset(-1),
        },
        {
          id: "call_northline_1",
          businessId: "biz_northline",
          status: "completed",
          outcome: "interested",
          summary: "Andre prioritizes calls from nearby drivers and a fast insurance FAQ. He approved a $2,400 proposal for review.",
          transcript: "The business handles mobile repair across Oakland and Alameda. Same-day availability changes daily, so the CTA should remain phone-first.",
          durationSeconds: 492,
          provider: "Manual record",
          mode: "manual",
          costCents: 0,
          createdAt: isoOffset(-3),
        },
      ])
      .run();

    tx.insert(schema.quotes)
      .values([
        {
          id: "quo_northline",
          businessId: "biz_northline",
          estimatedCostCents: 90000,
          configuredFloorCents: 150000,
          multiplierFloorCents: 180000,
          enforcedFloorCents: 180000,
          proposedPriceCents: 240000,
          scope: "Five-page responsive site, service-area content, insurance FAQ, quote request, analytics, and launch support.",
          status: "sent",
          expiresAt: isoOffset(6),
          createdAt: isoOffset(-2),
        },
        {
          id: "quo_tide",
          businessId: "biz_tide",
          estimatedCostCents: 105000,
          configuredFloorCents: 150000,
          multiplierFloorCents: 210000,
          enforcedFloorCents: 210000,
          proposedPriceCents: 320000,
          scope: "Portfolio-led site, project case studies, consultation form, local SEO setup, and 30 days of revisions.",
          status: "accepted",
          expiresAt: isoOffset(-10),
          createdAt: isoOffset(-18),
        },
      ])
      .run();

    tx.insert(schema.payments)
      .values({
        id: "pay_tide",
        businessId: "biz_tide",
        quoteId: "quo_tide",
        amountCents: 320000,
        status: "paid",
        provider: "Manual sandbox record",
        reference: "SANDBOX-TIDE-001",
        paidAt: isoOffset(-15),
        createdAt: isoOffset(-15),
      })
      .run();

    tx.insert(schema.projects)
      .values([
        {
          id: "prj_tide",
          businessId: "biz_tide",
          status: "review",
          brief:
            "Build a restrained, image-led landscape studio site with project proof, an explicit East Bay service area, and a low-friction consultation request.",
          previewToken: "tide-timber-review-7f3c",
          productionUrl: null,
          revisionCount: 1,
          deliveredAt: null,
          createdAt: isoOffset(-14),
          updatedAt: isoOffset(-1),
        },
        {
          id: "prj_new_leaf",
          businessId: "biz_new_leaf",
          status: "complete",
          brief: "Friendly service-led grooming site with booking request and first-visit guidance.",
          previewToken: "new-leaf-complete-4a2d",
          productionUrl: "https://example.test/new-leaf",
          revisionCount: 2,
          deliveredAt: isoOffset(-4),
          createdAt: isoOffset(-25),
          updatedAt: isoOffset(-4),
        },
      ])
      .run();

    tx.insert(schema.messages)
      .values([
        {
          id: "msg_marlowe_followup",
          businessId: "biz_marlowe",
          direction: "outbound",
          channel: "email",
          status: "recorded",
          subject: "Your BuildStax site outline",
          body: "Thanks for the conversation today. I captured the menu, hours, events, and directions as the core scope. I will send two pricing options next.",
          provider: "Local record",
          createdAt: isoOffset(-1),
        },
        {
          id: "msg_tide_feedback",
          businessId: "biz_tide",
          direction: "inbound",
          channel: "preview",
          status: "received",
          subject: "Preview feedback",
          body: "The overall direction feels right. Please bring the drought-aware planting work higher on the page and make the consultation button more direct.",
          provider: "Customer preview",
          createdAt: isoOffset(-1),
        },
        {
          id: "msg_tide_reply",
          businessId: "biz_tide",
          direction: "outbound",
          channel: "email",
          status: "recorded",
          subject: "Re: Tide & Timber preview",
          body: "Both changes are captured. The revised preview will keep the same visual direction and move the drought-aware work into the first project section.",
          provider: "Local record",
          createdAt: isoOffset(-1, 1),
        },
      ])
      .run();

    tx.insert(schema.automationRuns)
      .values([
        {
          id: "run_discovery_1",
          type: "discovery",
          status: "succeeded",
          provider: "Sandbox fixture",
          mode: "sandbox",
          summary: "Added 6 local business records; 5 passed website and contact-quality checks.",
          spendCents: 0,
          error: "",
          metadata: JSON.stringify({ candidates: 6, qualified: 5 }),
          startedAt: isoOffset(-11),
          finishedAt: isoOffset(-11, 1),
        },
        {
          id: "run_build_tide",
          type: "site_build",
          status: "succeeded",
          provider: "Local template adapter",
          mode: "sandbox",
          summary: "Generated the Tide & Timber customer preview from the approved requirements.",
          spendCents: 0,
          error: "",
          metadata: JSON.stringify({ projectId: "prj_tide" }),
          startedAt: isoOffset(-14),
          finishedAt: isoOffset(-14, 1),
        },
        {
          id: "run_email_blocked",
          type: "email_delivery",
          status: "blocked",
          provider: "Zero capability router",
          mode: "sandbox",
          summary: "Outbound delivery stayed local because live actions are disabled.",
          spendCents: 0,
          error: "Zero is not authenticated for this application environment.",
          metadata: JSON.stringify({ safeguard: "ZERO_LIVE_ACTIONS" }),
          startedAt: isoOffset(-1),
          finishedAt: isoOffset(-1),
        },
      ])
      .run();

    tx.insert(schema.auditEvents)
      .values([
        {
          id: "aud_seed",
          actorId: "system",
          action: "sandbox.seeded",
          entityType: "workspace",
          entityId: "default",
          detail: "Loaded the clearly labeled local evaluation dataset.",
          createdAt: isoOffset(-11),
        },
        {
          id: "aud_tide_feedback",
          actorId: "customer",
          action: "feedback.received",
          entityType: "business",
          entityId: "biz_tide",
          detail: "Customer submitted two changes from the secure preview link.",
          createdAt: isoOffset(-1),
        },
        {
          id: "aud_northline_quote",
          actorId: "usr_owner",
          action: "quote.sent",
          entityType: "business",
          entityId: "biz_northline",
          detail: "Recorded a $2,400 proposal above the enforced $1,800 floor.",
          createdAt: isoOffset(-2),
        },
      ])
      .run();

    seedSettings(tx, now);
  });
}

function seedSettings(db: BetterSQLite3Database<typeof schema>, now: string) {
  db.insert(schema.settings)
    .values([
      { key: "workspace_name", value: "BuildStax Operations", updatedAt: now },
      { key: "default_pricing_floor_cents", value: "150000", updatedAt: now },
      { key: "currency", value: "USD", updatedAt: now },
      { key: "timezone", value: "America/Los_Angeles", updatedAt: now },
      { key: "require_call_before_email", value: "true", updatedAt: now },
      { key: "block_dnc_outreach", value: "true", updatedAt: now },
      { key: "require_payment_before_build", value: "true", updatedAt: now },
    ])
    .onConflictDoNothing()
    .run();
}
