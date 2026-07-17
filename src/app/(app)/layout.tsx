import { Suspense } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getWorkspaceSettings } from "@/lib/db/queries";
import { isSandbox } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceShellFallback />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}

async function AuthenticatedWorkspace({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireUser(), getWorkspaceSettings()]);
  return (
    <AppShell user={user} workspaceName={settings.workspace_name ?? "BuildStax Operations"} sandbox={isSandbox()}>
      {children}
    </AppShell>
  );
}

function WorkspaceShellFallback() {
  return (
    <div role="status" aria-label="Loading workspace" className="min-h-screen bg-background lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-[var(--sidebar)] lg:flex">
        <div className="flex h-[72px] items-center gap-3 border-b border-[var(--sidebar-border)] px-4">
          <BrandMark className="size-9" />
          <div className="min-w-0 flex-1">
            <div className="h-3 w-20 rounded bg-white/80" />
            <div className="mt-2 h-2 w-28 rounded bg-white/15" />
          </div>
        </div>
        <div className="space-y-2 px-3 py-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex h-10 items-center gap-3 rounded-[8px] px-2.5">
              <div className="size-7 rounded-[7px] bg-white/[0.07]" />
              <div className="h-2.5 rounded bg-white/[0.09]" style={{ width: `${74 + (index % 3) * 18}px` }} />
            </div>
          ))}
        </div>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <div className="flex h-[60px] items-center gap-2.5 border-b border-border bg-white px-4 lg:hidden">
          <BrandMark className="size-8" />
          <div><div className="h-3 w-20 rounded bg-[#252b3c]/80" /><div className="mt-1.5 h-2 w-28 rounded bg-muted" /></div>
        </div>
        <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-7 xl:px-9 xl:py-8">
          <div className="mx-auto w-full max-w-[1480px] space-y-5">
            <div className="skeleton-block h-8 w-56 rounded-[8px]" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-block h-32 rounded-[10px] border border-border" />)}
            </div>
            <div className="skeleton-block h-96 rounded-[10px] border border-border" />
          </div>
        </main>
      </div>
      <span className="sr-only">Loading workspace</span>
    </div>
  );
}
