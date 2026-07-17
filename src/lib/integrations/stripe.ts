import "server-only";

import Stripe from "stripe";
import type { Business, Quote, User } from "@/lib/db/schema";

type StripeEnvironment = "test" | "live";

function stripeEnvironment(): StripeEnvironment {
  return process.env.STRIPE_ENVIRONMENT === "live" ? "live" : "test";
}

export function isStripeCheckoutConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRODUCT_ID);
}

function stripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe Checkout is not configured.");
  const environment = stripeEnvironment();
  if (environment === "test" && !secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe test mode requires a test secret key.");
  }
  if (environment === "live" && !secretKey.startsWith("sk_live_")) {
    throw new Error("Stripe live mode requires a live secret key.");
  }
  if (environment === "live" && process.env.APP_MODE !== "production") {
    throw new Error("Stripe live mode is blocked while BuildStax is not in live mode.");
  }
  if (environment === "test" && process.env.APP_MODE === "production") {
    throw new Error("Stripe test mode is blocked in a production BuildStax process.");
  }
  return new Stripe(secretKey, {
    appInfo: { name: "BuildStax", version: "0.1.0", url: "https://buildstax.local" },
    maxNetworkRetries: 1,
    timeout: 12_000,
  });
}

function appUrl() {
  const value = process.env.APP_URL;
  if (!value && process.env.APP_MODE === "production") {
    throw new Error("APP_URL is required in production.");
  }
  const resolved = value || "http://127.0.0.1:3000";
  const parsed = new URL(resolved);
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("APP_URL must use HTTPS outside local development.");
  }
  if (process.env.APP_MODE === "production" && (parsed.protocol !== "https:" || local)) {
    throw new Error("APP_URL must be an external HTTPS origin in production.");
  }
  return parsed.origin;
}

function safeCheckoutUrl(value: string | null) {
  if (!value) throw new Error("Stripe did not return a Checkout URL.");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || !(parsed.hostname === "stripe.com" || parsed.hostname.endsWith(".stripe.com"))) {
    throw new Error("Stripe returned an unexpected Checkout destination.");
  }
  return parsed.toString();
}

export async function createQuoteCheckoutSession(input: {
  workspaceId: string;
  business: Business;
  quote: Quote;
  operator: User;
}) {
  const productId = process.env.STRIPE_PRODUCT_ID;
  if (!productId) throw new Error("Stripe Checkout is not configured.");
  const environment = stripeEnvironment();
  const stripe = stripeClient();
  const origin = appUrl();
  if (new Date(input.quote.expiresAt).getTime() <= Date.now()) {
    throw new Error("This quote has expired. Create a new quote before starting Checkout.");
  }
  const metadata = {
    buildstax_application: "buildstax",
    buildstax_workspace_id: input.workspaceId,
    buildstax_business_id: input.business.id,
    buildstax_quote_id: input.quote.id,
    buildstax_environment: environment,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: input.quote.id,
    customer_email: input.business.email || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        product: productId,
        unit_amount: input.quote.proposedPriceCents,
      },
    }],
    metadata,
    payment_intent_data: {
      description: `BuildStax website delivery for ${input.business.name}`,
      metadata,
    },
    payment_method_types: ["card"],
    submit_type: "pay",
    success_url: `${origin}/businesses/${encodeURIComponent(input.business.id)}?payment=processing`,
    cancel_url: `${origin}/businesses/${encodeURIComponent(input.business.id)}?payment=cancelled`,
  }, {
    idempotencyKey: `buildstax:${environment}:${input.workspaceId}:${input.quote.id}`,
  });

  return {
    id: session.id,
    url: safeCheckoutUrl(session.url),
    environment,
    operatorId: input.operator.id,
  };
}

export async function getStripeReadiness() {
  if (!isStripeCheckoutConfigured()) {
    return { status: "missing" as const, detail: "Stripe Checkout is not configured." };
  }
  try {
    const stripe = stripeClient();
    const productId = process.env.STRIPE_PRODUCT_ID as string;
    const webhookId = process.env.STRIPE_WEBHOOK_ENDPOINT_ID;
    const [balance, product, webhook] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.products.retrieve(productId),
      webhookId ? stripe.webhookEndpoints.retrieve(webhookId) : Promise.resolve(null),
    ]);
    const expectedPath = `/api/webhooks/stripe/${stripeEnvironment()}`;
    const webhookReady = Boolean(webhook && webhook.status === "enabled" && webhook.url.includes(expectedPath));
    const productReady = !product.deleted && product.active;
    const accountReady = balance.livemode === (stripeEnvironment() === "live");
    return accountReady && productReady && webhookReady
      ? { status: "ready" as const, detail: `Stripe Checkout, the BuildStax product, and InsForge's managed webhook are verified in ${stripeEnvironment()} mode.` }
      : { status: "partial" as const, detail: "Stripe responded, but the account, product, or InsForge-managed webhook is not fully ready." };
  } catch {
    return { status: "partial" as const, detail: "Stripe is configured, but live account and webhook readiness could not be verified." };
  }
}

export function safeStripeMessage(error: unknown) {
  if (!(error instanceof Error)) return "Stripe Checkout could not be started.";
  if (/rate|too many/i.test(error.message)) return "Stripe is busy. Wait a moment and try again.";
  if (/not configured|test mode|live mode|APP_URL|quote has expired/i.test(error.message)) return error.message;
  return "Stripe Checkout could not be started. No payment was created.";
}
