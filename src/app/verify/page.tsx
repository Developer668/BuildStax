import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isInsForgeBackend } from "@/lib/backend";
import { VerifyForm } from "./verify-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (!isInsForgeBackend()) notFound();
  const { email = "" } = await searchParams;
  return (
    <main className="auth-surface flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-[420px]"><div className="mb-10 flex items-center gap-3"><BrandMark className="size-10" /><div><div className="text-[16px] font-extrabold">BuildStax</div><div className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground">Operations console</div></div></div><div className="panel p-6 shadow-[0_12px_36px_rgba(18,24,40,0.06)] sm:p-7"><div className="mb-5 flex size-9 items-center justify-center rounded-[8px] border border-border bg-surface-subtle text-muted-foreground"><BadgeCheck className="size-4" /></div><h1 className="text-[23px] font-extrabold tracking-[-0.02em]">Verify your email</h1><p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Enter the six-digit code InsForge sent to your inbox.</p><VerifyForm email={email} /></div></div>
    </main>
  );
}
