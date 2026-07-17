import { Command, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isInsForgeBackend } from "@/lib/backend";
import { redirectAuthenticatedUser } from "@/lib/actions/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!isInsForgeBackend()) notFound();
  await redirectAuthenticatedUser();
  return (
    <main className="grid min-h-screen bg-[#edf0ec] lg:grid-cols-[minmax(420px,0.88fr)_minmax(520px,1.12fr)]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-[6px] bg-[#151815] text-accent"><Command className="size-5" /></div><div><div className="text-[16px] font-extrabold">BuildStax</div><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Operations console</div></div></div>
          <div className="panel p-5 sm:p-6"><div className="mb-5 flex size-9 items-center justify-center rounded-[5px] border border-border bg-surface-subtle text-muted-foreground"><UserRoundPlus className="size-4" /></div><h1 className="text-[22px] font-extrabold">Create operator account</h1><p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Your workspace and records remain isolated by InsForge row policies.</p><SignupForm /></div>
        </div>
      </section>
      <section className="relative hidden min-h-screen overflow-hidden border-l border-[#303630] bg-[#161a17] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(#313831 1px, transparent 1px), linear-gradient(90deg, #313831 1px, transparent 1px)", backgroundSize: "38px 38px" }} /><div className="relative max-w-xl"><div className="eyebrow !text-[#8e978e]">Operator identity</div><h2 className="mt-4 max-w-lg text-[42px] font-extrabold leading-[1.08]">One accountable workspace for every customer handoff.</h2><p className="mt-5 max-w-md text-[14px] leading-6 text-[#a9b2a9]">Email verification protects access before the first business record is created.</p></div></section>
    </main>
  );
}
