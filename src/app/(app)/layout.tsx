import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getWorkspaceSettings } from "@/lib/db/queries";
import { isSandbox } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireUser(), getWorkspaceSettings()]);
  return (
    <AppShell user={user} workspaceName={settings.workspace_name ?? "BuildStax Operations"} sandbox={isSandbox()}>
      {children}
    </AppShell>
  );
}
