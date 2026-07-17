import type { Metadata } from "next";
import { Command, LockKeyhole } from "lucide-react";
import { redirectAuthenticatedUser } from "@/lib/actions/auth";
import { getAdminIdentity } from "@/lib/auth/password";
import { LoginForm } from "./login-form";
import { isInsForgeBackend } from "@/lib/backend";
import { isSandbox } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectAuthenticatedUser();
  const insforge = isInsForgeBackend();
  const identity = insforge ? null : getAdminIdentity();
  return (
    <main className="grid min-h-screen bg-[#edf0ec] lg:grid-cols-[minmax(420px,0.88fr)_minmax(520px,1.12fr)]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-[6px] bg-[#151815] text-accent"><Command className="size-5" /></div>
            <div>
              <div className="text-[16px] font-extrabold">BuildStax</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Operations console</div>
            </div>
          </div>
          <div className="panel p-5 sm:p-6">
            <div className="mb-5 flex size-9 items-center justify-center rounded-[5px] border border-border bg-surface-subtle text-muted-foreground"><LockKeyhole className="size-4" /></div>
            <h1 className="text-[22px] font-extrabold">Operator sign in</h1>
            <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Access prospect, pricing, payment, and delivery records.</p>
            <LoginForm
              defaultEmail={identity?.email ?? ""}
              showLocalCredentials={Boolean(identity?.passwordIsLocalDefault && process.env.APP_MODE !== "production")}
              allowSignUp={insforge}
              testLoginEnabled={insforge && isSandbox() && Boolean(process.env.TEST_LOGIN_EMAIL && process.env.TEST_LOGIN_PASSWORD)}
            />
          </div>
          <p className="mt-4 text-center text-[10px] text-muted-foreground">Protected operations surface · Session expires after 12 hours</p>
        </div>
      </section>
      <section className="relative hidden min-h-screen overflow-hidden border-l border-[#303630] bg-[#161a17] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(#313831 1px, transparent 1px), linear-gradient(90deg, #313831 1px, transparent 1px)", backgroundSize: "38px 38px" }} />
        <div className="relative max-w-xl">
          <div className="eyebrow !text-[#8e978e]">Controlled delivery loop</div>
          <h2 className="mt-4 max-w-lg text-[42px] font-extrabold leading-[1.08]">From qualified lead to a site the customer can approve.</h2>
          <p className="mt-5 max-w-md text-[14px] leading-6 text-[#a9b2a9]">Every call, floor calculation, payment, build, and revision stays attached to one accountable record.</p>
        </div>
        <div className="relative grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-[#333a33] bg-[#333a33]">
          {[['01', 'Call first'], ['02', 'Price safely'], ['03', 'Deliver visibly']].map(([number, label]) => (
            <div key={number} className="bg-[#1b201b] p-4"><div className="mono text-[10px] text-accent">{number}</div><div className="mt-7 text-[11px] font-bold">{label}</div></div>
          ))}
        </div>
      </section>
    </main>
  );
}
