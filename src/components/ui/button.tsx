import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[5px] border px-3 text-[12px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-[#141a0e] bg-accent text-accent-foreground hover:bg-[#a9df3f]",
        dark: "border-[#151815] bg-[#151815] text-white hover:bg-[#292e29]",
        secondary: "border-border bg-white text-foreground hover:bg-surface-subtle",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-muted",
        danger: "border-[#b73d30] bg-danger text-white hover:bg-[#bd3d30]",
        link: "h-auto border-transparent bg-transparent px-0 text-brand-blue hover:underline",
      },
      size: {
        default: "h-9",
        sm: "h-8 px-2.5 text-[11px]",
        lg: "h-10 px-4 text-[13px]",
        icon: "h-9 w-9 px-0",
        iconSm: "h-8 w-8 px-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
