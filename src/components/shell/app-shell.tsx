"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorUp,
  PlugZap,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/lib/db/schema";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/dashboard", label: "Command center", icon: LayoutDashboard },
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
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);

  const navigationPending = Boolean(pendingHref && pendingHref !== pathname);

  useEffect(() => {
    const warmNavigation = () => {
      for (const item of navigation) {
        if (item.href !== pathname) router.prefetch(item.href);
      }
    };
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(warmNavigation, { timeout: 1_500 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = globalThis.setTimeout(warmNavigation, 800);
    return () => globalThis.clearTimeout(timer);
  }, [pathname, router]);

  const warmRoute = (href: string) => {
    if (href !== pathname) router.prefetch(href);
  };

  const sidebar = (
    <>
      <div className="flex h-[72px] items-center gap-3 border-b border-[var(--sidebar-border)] px-4">
        <BrandMark className="size-9" />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold tracking-[-0.01em] text-white">BuildStax</div>
          <div className="truncate text-[9px] font-medium text-[var(--sidebar-muted)]">{workspaceName}</div>
        </div>
      </div>
      <div className="px-3 py-5">
        <div className="mb-2.5 px-2.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">Workspace</div>
        <nav aria-label="Primary navigation" className="space-y-1">
          {navigation.map((item, index) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const pending = pendingHref === item.href && !active;
            return (
              <div key={item.href}>
                {index === 6 ? (
                  <div className="mb-2 mt-4 border-t border-[var(--sidebar-border)] pt-4">
                    <span className="px-2.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">System</span>
                  </div>
                ) : null}
                <Link
                  href={item.href}
                  onClick={() => {
                    setMobileOpen(false);
                    if (!active) setPendingHref(item.href);
                  }}
                  onPointerEnter={() => warmRoute(item.href)}
                  onFocus={() => warmRoute(item.href)}
                  onTouchStart={() => warmRoute(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-[8px] px-2.5 text-[11px] font-semibold transition-colors duration-100",
                    active ? "bg-white/[0.09] text-white" : pending ? "bg-white/[0.06] text-white" : "text-[#aeb4c2] hover:bg-white/[0.055] hover:text-white",
                  )}
                >
                  <span className={cn("grid size-7 place-items-center rounded-[7px] transition-colors duration-100", active ? "bg-[#5266ed] text-white" : "text-[#7f8798] group-hover:text-[#c7cbd5]") }>
                    <item.icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {pending ? <span className="size-1.5 animate-pulse rounded-full bg-[#8f9cff]" aria-hidden="true" /> : null}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t border-[var(--sidebar-border)] p-3">
        <div className="mb-3 flex items-start gap-2.5 rounded-[8px] border border-[#30384b] bg-white/[0.025] px-3 py-3">
          <span className={cn("mt-1 size-2 shrink-0 rounded-full", sandbox ? "bg-[#d99a45]" : "bg-[#6db7a5]")} />
          <div>
            <div className="text-[10px] font-bold text-white">{sandbox ? "Sandbox mode" : "Production mode"}</div>
            <div className="mt-0.5 text-[9px] leading-4 text-[#9199a9]">{sandbox ? "Calls and emails stay local; payments use Stripe test mode." : "Live actions remain policy gated."}</div>
          </div>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex h-11 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-white hover:bg-white/[0.055]" aria-label="Open account menu">
              <span className="grid size-7 place-items-center rounded-[7px] bg-[#30384c] text-[9px] font-extrabold text-[#cbd0ff]">{initials(user.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold">{user.name}</span>
                <span className="block truncate text-[9px] text-[#9199a9]">{user.role}</span>
              </span>
              <ChevronDown className="size-3.5 text-[#7e8799]" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" side="top" sideOffset={8} className="z-50 min-w-52 rounded-[9px] border border-border bg-white p-1 shadow-[0_16px_40px_rgba(18,24,40,0.16)]">
              <div className="border-b border-border px-2 py-2">
                <div className="text-[11px] font-bold">{user.name}</div>
                <div className="text-[10px] text-muted-foreground">{user.email}</div>
              </div>
              <DropdownMenu.Item asChild>
                <form action={logoutAction} className="mt-1">
                  <button type="submit" className="flex h-8 w-full items-center gap-2 rounded-[7px] px-2 text-[11px] font-semibold hover:bg-muted">
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
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {navigationPending ? <div className="navigation-progress" aria-hidden="true" /> : null}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-[var(--sidebar)] lg:flex">{sidebar}</aside>
      <div className="min-w-0 lg:col-start-2">
        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-white px-4 lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-8" />
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
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#111522]/25 lg:hidden" />
            <DialogPrimitive.Content asChild onOpenAutoFocus={(event) => { event.preventDefault(); mobileCloseRef.current?.focus(); }}>
              <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,288px)] flex-col bg-[var(--sidebar)] shadow-[14px_0_40px_rgba(17,21,34,0.22)] outline-none lg:hidden">
                <DialogPrimitive.Title className="sr-only">Workspace navigation</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Navigate BuildStax or manage the current operator session.</DialogPrimitive.Description>
                {sidebar}
                <DialogPrimitive.Close asChild>
                  <button ref={mobileCloseRef} className="absolute right-3 top-3 grid size-8 place-items-center rounded-[7px] text-white hover:bg-white/10" aria-label="Close navigation"><X className="size-4" /></button>
                </DialogPrimitive.Close>
              </aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <main id="main-content" className="page-enter min-h-screen px-4 py-5 sm:px-6 sm:py-7 xl:px-9 xl:py-8">
          <div className="mx-auto w-full max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
