import { UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isInsForgeBackend } from "@/lib/backend";
import { redirectAuthenticatedUser } from "@/lib/actions/auth";
import { SignupForm } from "./signup-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!isInsForgeBackend()) notFound();
  await redirectAuthenticatedUser();
  return (
    <main className="auth-surface grid min-h-screen lg:grid-cols-[minmax(420px,0.88fr)_minmax(520px,1.12fr)]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3"><BrandMark className="size-10" /><div><div className="text-[16px] font-extrabold">BuildStax</div><div className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground">Operations console</div></div></div>
          <div className="panel p-6 shadow-[0_12px_36px_rgba(18,24,40,0.06)] sm:p-7"><div className="mb-5 flex size-9 items-center justify-center rounded-[8px] border border-border bg-surface-subtle text-muted-foreground"><UserRoundPlus className="size-4" /></div><h1 className="text-[23px] font-extrabold tracking-[-0.02em]">Create operator account</h1><p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Your workspace and records remain isolated by InsForge row policies.</p><SignupForm /></div>
        </div>
      </section>
      <section className="auth-visual hidden min-h-screen border-l border-[#2b3243] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="max-w-xl"><div className="eyebrow !text-[#969dac]">Operator identity</div><h2 className="mt-4 max-w-lg text-[42px] font-extrabold leading-[1.08] tracking-[-0.035em]">One accountable workspace for every customer handoff.</h2><p className="mt-5 max-w-md text-[14px] leading-6 text-[#aeb4c2]">Email verification protects access before the first business record is created.</p></div></section>
    </main>
  );
}
