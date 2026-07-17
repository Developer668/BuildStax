import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-[5px] border border-border bg-white px-3 text-[13px] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.02)] placeholder:text-[#919991] disabled:cursor-not-allowed disabled:bg-muted",
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
      "min-h-28 w-full resize-y rounded-[5px] border border-border bg-white px-3 py-2.5 text-[13px] leading-5 text-foreground placeholder:text-[#919991] disabled:cursor-not-allowed disabled:bg-muted",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("h-10 w-full rounded-[5px] border border-border bg-white px-3 text-[13px] text-foreground", className)}
    {...props}
  />
));
SelectInput.displayName = "SelectInput";
