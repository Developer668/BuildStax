import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border px-3 text-[11px] font-bold transition-[background-color,border-color,color,box-shadow,transform] duration-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-[#4559d8] bg-accent text-accent-foreground shadow-[0_1px_2px_rgba(45,56,134,0.18)] hover:bg-[#4659dd]",
        dark: "border-[#171c2b] bg-[#171c2b] text-white hover:bg-[#252c40]",
        secondary: "border-border bg-white text-foreground shadow-[0_1px_1px_rgba(18,24,40,0.03)] hover:border-[#cfd3dc] hover:bg-[#f8f9fb]",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-muted",
        danger: "border-[#b73d30] bg-danger text-white hover:bg-[#bd3d30]",
        link: "h-auto border-transparent bg-transparent px-0 text-brand-blue hover:underline active:translate-y-0",
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
