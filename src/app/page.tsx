import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

const fallbackPhone = "+13307377690";

function publicPhoneNumber() {
  const configured = process.env.PLIVO_PRIMARY_NUMBER?.trim() ?? "";
  return /^\+[1-9]\d{7,14}$/.test(configured) ? configured : fallbackPhone;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

export const metadata: Metadata = {
  title: "Start your website by phone",
  description: "Call BuildStax's AI website line and turn a conversation about your business into a confirmed, build-ready website brief.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "BuildStax — Start your website by phone",
    description: "One call turns your business goals into a confirmed website brief and a clear next step.",
    type: "website",
  },
};

export default function HomePage() {
  const phone = publicPhoneNumber();
  return <LandingPage phoneDisplay={formatPhone(phone)} phoneHref={`tel:${phone}`} />;
}
