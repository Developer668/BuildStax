import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-[#d5dad4] bg-[#f1f3f0] text-[#596159]",
  info: "border-[#c8d6ff] bg-[#edf2ff] text-[#244fbf]",
  warning: "border-[#edd4aa] bg-[#fff7e8] text-[#8a5312]",
  success: "border-[#b8dec7] bg-[#edf8f1] text-[#21683f]",
  danger: "border-[#efc4bd] bg-[#fff0ed] text-[#a33d31]",
} as const;

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-bold", tones[tone], className)} {...props} />;
}
