import type { LucideIcon } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action, icon: Icon }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <div className="flex items-center gap-2.5">
          {Icon ? <Icon className="size-5 text-muted-foreground" aria-hidden="true" /> : null}
          <h1 className="text-[24px] font-extrabold leading-tight sm:text-[26px]">{title}</h1>
        </div>
        {description ? <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
