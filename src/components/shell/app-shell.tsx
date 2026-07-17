"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  ChevronDown,
  Command,
  LayoutDashboard,
  MonitorUp,
  LogOut,
  Menu,
  PlugZap,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/lib/db/schema";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/", label: "Command center", icon: LayoutDashboard },
  { href: "/prospecting", label: "Prospecting", icon: Bot },
  { href: "/pipeline", label: "Pipeline", icon: Building2 },
  { href: "/campaigns", label: "Campaigns & pitch", icon: BarChart3 },
  { href: "/build-studio", label: "Build studio", icon: MonitorUp },
  { href: "/runs", label: "Automation runs", icon: Activity },
  { href: "/integrations", label: "Integrations", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ user, workspaceName, sandbox, children }: { user: User; workspaceName: string; sandbox: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);

  const sidebar = (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-[var(--sidebar-border)] px-4">
        <div className="grid size-8 place-items-center rounded-[5px] border border-[#3b4435] bg-accent text-accent-foreground">
          <Command className="size-4" strokeWidth={2.4} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-extrabold text-white">BuildStax</div>
          <div className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--sidebar-muted)]">Sales + delivery ops</div>
        </div>
      </div>
      <div className="px-3 py-4">
        <div className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--sidebar-muted)]">Workspace</div>
        <nav aria-label="Primary navigation" className="space-y-1">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-[5px] px-2.5 text-[12px] font-semibold transition-colors",
                  active ? "bg-[#2b3229] text-white" : "text-[#a8b0a8] hover:bg-[#222722] hover:text-white",
                )}
              >
                <item.icon className={cn("size-4", active ? "text-accent" : "text-[#7d877d]")} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t border-[var(--sidebar-border)] p-3">
        <div className="mb-3 flex items-start gap-2.5 rounded-[5px] border border-[#303730] bg-[#1b201b] px-3 py-2.5">
          <span className={cn("mt-1 size-2 shrink-0 rounded-full", sandbox ? "bg-[#f3a43b]" : "bg-accent")} />
          <div>
            <div className="text-[10px] font-bold text-white">{sandbox ? "Sandbox mode" : "Production mode"}</div>
            <div className="mt-0.5 text-[9px] leading-4 text-[#8e978e]">{sandbox ? "Calls and emails stay local; payments use Stripe test mode." : "Live actions remain policy gated."}</div>
          </div>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex h-11 w-full items-center gap-2.5 rounded-[5px] px-2 text-left text-white hover:bg-[#222722]" aria-label="Open account menu">
              <span className="grid size-7 place-items-center rounded-full bg-[#343c34] text-[9px] font-extrabold text-accent">{initials(user.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold">{user.name}</span>
                <span className="block truncate text-[9px] text-[#8e978e]">{user.role}</span>
              </span>
              <ChevronDown className="size-3.5 text-[#798279]" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" side="top" sideOffset={8} className="z-50 min-w-52 rounded-[6px] border border-border bg-white p-1 shadow-xl">
              <div className="border-b border-border px-2 py-2">
                <div className="text-[11px] font-bold">{user.name}</div>
                <div className="text-[10px] text-muted-foreground">{user.email}</div>
              </div>
              <DropdownMenu.Item asChild>
                <form action={logoutAction} className="mt-1">
                  <button type="submit" className="flex h-8 w-full items-center gap-2 rounded-[4px] px-2 text-[11px] font-semibold hover:bg-muted">
                    <LogOut className="size-3.5" aria-hidden="true" /> Sign out
                  </button>
                </form>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col bg-[var(--sidebar)] lg:flex">{sidebar}</aside>
      <div className="min-w-0 lg:col-start-2">
        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur-sm lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-[5px] bg-[#151815] text-accent"><Command className="size-4" /></div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-extrabold">BuildStax</div>
                <div className="truncate text-[9px] text-muted-foreground">{workspaceName}</div>
              </div>
            </div>
            <DialogPrimitive.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation"><Menu /></Button>
            </DialogPrimitive.Trigger>
          </header>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 lg:hidden" />
            <DialogPrimitive.Content asChild onOpenAutoFocus={(event) => { event.preventDefault(); mobileCloseRef.current?.focus(); }}>
              <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,280px)] flex-col bg-[var(--sidebar)] shadow-2xl outline-none lg:hidden">
                <DialogPrimitive.Title className="sr-only">Workspace navigation</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Navigate BuildStax or manage the current operator session.</DialogPrimitive.Description>
                {sidebar}
                <DialogPrimitive.Close asChild>
                  <button ref={mobileCloseRef} className="absolute right-3 top-3 grid size-8 place-items-center rounded-[5px] text-white hover:bg-[#2b3229]" aria-label="Close navigation"><X className="size-4" /></button>
                </DialogPrimitive.Close>
              </aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <main id="main-content" className="page-enter min-h-screen px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-7">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
