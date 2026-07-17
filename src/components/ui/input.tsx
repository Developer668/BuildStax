import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-[8px] border border-border bg-white px-3 text-[12px] text-foreground shadow-[0_1px_1px_rgba(18,24,40,0.025)] transition-[border-color,box-shadow] duration-100 placeholder:text-[#969cab] focus:border-[#9aa6f4] disabled:cursor-not-allowed disabled:bg-muted",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-28 w-full resize-y rounded-[8px] border border-border bg-white px-3 py-2.5 text-[12px] leading-5 text-foreground transition-[border-color,box-shadow] duration-100 placeholder:text-[#969cab] focus:border-[#9aa6f4] disabled:cursor-not-allowed disabled:bg-muted",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("h-10 w-full rounded-[8px] border border-border bg-white px-3 text-[12px] text-foreground transition-[border-color,box-shadow] duration-100 focus:border-[#9aa6f4]", className)}
    {...props}
  />
));
SelectInput.displayName = "SelectInput";
