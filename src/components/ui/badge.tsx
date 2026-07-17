import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-[#dde0e6] bg-[#f3f4f6] text-[#5f6674]",
  info: "border-[#ccd3fb] bg-[#eef0ff] text-[#4051bd]",
  warning: "border-[#ead7b8] bg-[#fbf5e9] text-[#84561b]",
  success: "border-[#bddbd3] bg-[#edf7f4] text-[#236756]",
  danger: "border-[#ebc4c4] bg-[#fff0f0] text-[#9f3f3f]",
} as const;

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex h-6 items-center rounded-[6px] border px-2 text-[9px] font-bold capitalize", tones[tone], className)} {...props} />;
}
