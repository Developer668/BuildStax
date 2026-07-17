import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { redirectAuthenticatedUser } from "@/lib/actions/auth";
import { getAdminIdentity } from "@/lib/auth/password";
import { BrandMark } from "@/components/brand/brand-mark";
import { LoginForm } from "./login-form";
import { isInsForgeBackend } from "@/lib/backend";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectAuthenticatedUser();
  const insforge = isInsForgeBackend();
  const identity = insforge ? null : getAdminIdentity();
  return (
    <main className="auth-surface grid min-h-screen lg:grid-cols-[minmax(420px,0.88fr)_minmax(520px,1.12fr)]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3">
            <BrandMark className="size-10" />
            <div>
              <div className="text-[16px] font-extrabold">BuildStax</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground">Operations console</div>
            </div>
          </div>
          <div className="panel p-6 shadow-[0_12px_36px_rgba(18,24,40,0.06)] sm:p-7">
            <div className="mb-5 flex size-9 items-center justify-center rounded-[8px] border border-border bg-surface-subtle text-muted-foreground"><LockKeyhole className="size-4" /></div>
            <h1 className="text-[23px] font-extrabold tracking-[-0.02em]">Operator sign in</h1>
            <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Access prospect, pricing, payment, and delivery records.</p>
            <LoginForm
              defaultEmail={identity?.email ?? ""}
              showLocalCredentials={Boolean(identity?.passwordIsLocalDefault && process.env.APP_MODE !== "production")}
              allowSignUp={insforge}
            />
          </div>
          <p className="mt-4 text-center text-[10px] text-muted-foreground">Protected operations surface · Session expires after 12 hours</p>
        </div>
      </section>
      <section className="auth-visual hidden min-h-screen border-l border-[#2b3243] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="max-w-xl">
          <div className="eyebrow !text-[#969dac]">Controlled delivery loop</div>
          <h2 className="mt-4 max-w-lg text-[42px] font-extrabold leading-[1.08] tracking-[-0.035em]">From qualified lead to a site the customer can approve.</h2>
          <p className="mt-5 max-w-md text-[14px] leading-6 text-[#aeb4c2]">Every call, floor calculation, payment, build, and revision stays attached to one accountable record.</p>
        </div>
        <div className="grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-[#343b4d] bg-[#343b4d]">
          {[['01', 'Call first'], ['02', 'Price safely'], ['03', 'Deliver visibly']].map(([number, label]) => (
            <div key={number} className="auth-step p-4"><div className="mono text-[10px] text-[#9ba6ff]">{number}</div><div className="mt-7 text-[11px] font-bold">{label}</div></div>
          ))}
        </div>
      </section>
    </main>
  );
}
