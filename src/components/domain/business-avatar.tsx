import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const colors = ["bg-[#e7f1ff] text-[#315b9f]", "bg-[#e9f5e6] text-[#356a35]", "bg-[#fff0df] text-[#8b551f]", "bg-[#f5e9f6] text-[#764879]"];

export function BusinessAvatar({ name, className }: { name: string; className?: string }) {
  const color = colors[name.charCodeAt(0) % colors.length];
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-[5px] text-[10px] font-extrabold", color, className)} aria-hidden="true">{initials(name)}</span>;
}
