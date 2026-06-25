import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* PRIMARY — standardized to match the "+ New Deal" liquid-glass button */
        default:
          "relative overflow-hidden border border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] text-foreground backdrop-blur-xl shadow-glass hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)] hover:shadow-glass-hover before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)]",
        /* SECONDARY — ghost glass blue */
        outline:
          "bg-[rgba(126,184,247,0.06)] backdrop-blur-[8px] border border-[rgba(126,184,247,0.22)] text-[#A8D0FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[rgba(126,184,247,0.12)] hover:border-[rgba(126,184,247,0.4)] hover:shadow-[0_0_16px_rgba(126,184,247,0.15),inset_0_1px_0_rgba(255,255,255,0.08)] active:scale-[0.98]",
        secondary:
          "bg-[rgba(126,184,247,0.06)] backdrop-blur-[8px] border border-[rgba(126,184,247,0.22)] text-[#A8D0FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[rgba(126,184,247,0.12)] hover:border-[rgba(126,184,247,0.4)] hover:shadow-[0_0_16px_rgba(126,184,247,0.15),inset_0_1px_0_rgba(255,255,255,0.08)] active:scale-[0.98]",
        /* TERTIARY — ghost, no border, muted text */
        ghost:
          "bg-transparent border-none text-muted-foreground hover:text-foreground",
        /* DROPDOWN — surface-3 fill, subtle border */
        dropdown:
          "bg-secondary border border-border rounded-lg hover:border-[rgba(126,184,247,0.22)]",
        /* Destructive */
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        /* Link */
        link:
          "text-primary underline-offset-4 hover:underline",
        /* Accent — same as primary */
        accent:
          "relative overflow-hidden font-semibold border border-[rgba(168,208,255,0.35)] text-white shadow-[0_0_20px_rgba(126,184,247,0.2),inset_0_1px_0_rgba(255,255,255,0.25)] bg-[linear-gradient(135deg,rgba(126,184,247,0.85),rgba(74,144,217,0.9))] backdrop-blur-[8px] hover:bg-[linear-gradient(135deg,rgba(148,200,255,0.95),rgba(90,160,235,0.95))] hover:shadow-accent-glow",
        /* Success */
        success:
          "bg-success text-success-foreground hover:bg-success/90 shadow-sm",
        /* Hero */
        hero:
          "relative overflow-hidden font-semibold border border-[rgba(168,208,255,0.35)] text-white shadow-[0_0_20px_rgba(126,184,247,0.2),inset_0_1px_0_rgba(255,255,255,0.25)] bg-[linear-gradient(135deg,rgba(126,184,247,0.85),rgba(74,144,217,0.9))] backdrop-blur-[8px] hover:bg-[linear-gradient(135deg,rgba(148,200,255,0.95),rgba(90,160,235,0.95))] hover:shadow-accent-glow-strong hover:-translate-y-0.5",
        "hero-outline":
          "border-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:border-primary/60",
        /* Gradient — brand gradient */
        gradient:
          "bg-brand-gradient text-white font-semibold hover:bg-brand-gradient-hover shadow-sm hover:shadow-accent-glow",
        /* Liquid glass */
        "liquid-glass":
          "relative overflow-hidden border border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] text-foreground backdrop-blur-xl shadow-glass hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)] hover:shadow-glass-hover before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8 text-base",
        xl: "h-12 rounded-lg px-10 text-base font-semibold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
