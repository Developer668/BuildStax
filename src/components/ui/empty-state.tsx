import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-border bg-surface-subtle text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <h3 className="text-[13px] font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
