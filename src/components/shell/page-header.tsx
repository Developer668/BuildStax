import type { LucideIcon } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action, icon: Icon }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <div className="flex items-center gap-3">
          {Icon ? <span className="grid size-8 place-items-center rounded-[8px] border border-border bg-white text-muted-foreground shadow-[0_1px_1px_rgba(18,24,40,0.03)]"><Icon className="size-4" aria-hidden="true" /></span> : null}
          <h1 className="text-[25px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[28px]">{title}</h1>
        </div>
        {description ? <p className="mt-2 max-w-2xl text-[12px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
