import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-role-ui transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* PRIMARY — flat spectrum fill */
        default:
          "bg-primary text-primary-foreground border border-transparent hover:bg-primary/90",
        /* SECONDARY / OUTLINE — hairlined, transparent */
        outline:
          "border border-[hsl(var(--ds-sky)/0.30)] bg-transparent text-foreground hover:bg-[hsl(var(--ds-sky)/0.10)] hover:border-[hsl(var(--ds-sky)/0.45)]",
        secondary:
          "border border-[hsl(var(--ds-sky)/0.30)] bg-transparent text-foreground hover:bg-[hsl(var(--ds-sky)/0.10)] hover:border-[hsl(var(--ds-sky)/0.45)]",
        /* TERTIARY — ghost */
        ghost:
          "bg-transparent border border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
        /* DROPDOWN — hairlined surface */
        dropdown:
          "bg-transparent border border-border/60 hover:border-[hsl(var(--ds-sky)/0.35)]",
        /* Destructive — violet, the spectrum's urgency end */
        destructive:
          "bg-[hsl(var(--status-critical))] text-white border border-transparent hover:bg-[hsl(var(--status-critical)/0.88)]",
        link:
          "text-primary underline-offset-4 hover:underline",
        accent:
          "bg-[hsl(var(--ds-sky))] text-[hsl(222_47%_8%)] border border-transparent hover:bg-[hsl(var(--ds-cyan))]",
        success:
          "bg-[hsl(var(--status-info))] text-[hsl(222_47%_8%)] border border-transparent hover:bg-[hsl(var(--status-info)/0.88)]",
        hero:
          "bg-[hsl(var(--ds-sky))] text-[hsl(222_47%_8%)] border border-transparent font-semibold hover:bg-[hsl(var(--ds-cyan))]",
        "hero-outline":
          "border border-primary/60 bg-transparent text-primary hover:bg-primary/10",
        gradient:
          "border border-transparent text-[hsl(222_47%_8%)] font-semibold bg-[linear-gradient(135deg,hsl(var(--ds-cyan)),hsl(var(--ds-indigo)))] hover:opacity-90",
        /* Legacy alias — now flat like the primary */
        "liquid-glass":
          "bg-primary text-primary-foreground border border-transparent hover:bg-primary/90",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-10 rounded-md px-6",
        xl: "h-11 rounded-md px-8 font-semibold",
        icon: "h-9 w-9",
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
