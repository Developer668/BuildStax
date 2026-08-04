import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalCall } from "@/components/local-call/local-call";
import { requireMutationUser } from "@/lib/auth/session";
import { isLocalCallAllowed } from "@/lib/integrations/local-realtime";

export const metadata: Metadata = { title: "Local call" };
export const dynamic = "force-dynamic";

export default async function LocalCallPage() {
  if (!isLocalCallAllowed()) notFound();
  await requireMutationUser();
  return <LocalCall />;
}
