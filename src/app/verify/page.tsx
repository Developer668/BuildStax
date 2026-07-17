import { BadgeCheck, Command } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isInsForgeBackend } from "@/lib/backend";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (!isInsForgeBackend()) notFound();
  const { email = "" } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#edf0ec] px-5 py-10">
      <div className="w-full max-w-[420px]"><div className="mb-10 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-[6px] bg-[#151815] text-accent"><Command className="size-5" /></div><div><div className="text-[16px] font-extrabold">BuildStax</div><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Operations console</div></div></div><div className="panel p-5 sm:p-6"><div className="mb-5 flex size-9 items-center justify-center rounded-[5px] border border-border bg-surface-subtle text-muted-foreground"><BadgeCheck className="size-4" /></div><h1 className="text-[22px] font-extrabold">Verify your email</h1><p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Enter the six-digit code InsForge sent to your inbox.</p><VerifyForm email={email} /></div></div>
    </main>
  );
}
