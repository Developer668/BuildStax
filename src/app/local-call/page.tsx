import type { Metadata } from "next";
import { LocalCall } from "@/components/local-call/local-call";

export const metadata: Metadata = { title: "Local call" };

export default function LocalCallPage() {
  return <LocalCall />;
}
