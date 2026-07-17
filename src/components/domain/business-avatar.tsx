import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const colors = ["bg-[#e9edff] text-[#4656b8]", "bg-[#eaf1f3] text-[#41646a]", "bg-[#f4efe8] text-[#775b38]", "bg-[#f0edf4] text-[#685b7b]"];

export function BusinessAvatar({ name, className }: { name: string; className?: string }) {
  const color = colors[name.charCodeAt(0) % colors.length];
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-[8px] text-[10px] font-extrabold", color, className)} aria-hidden="true">{initials(name)}</span>;
}
