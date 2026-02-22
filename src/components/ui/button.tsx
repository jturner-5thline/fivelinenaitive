import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:scale-[1.02] active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "relative overflow-hidden border border-[hsl(199,70%,45%,0.5)] bg-[linear-gradient(145deg,hsl(199,60%,20%,0.6)_0%,hsl(210,50%,15%,0.7)_50%,hsl(220,40%,10%,0.8)_100%)] text-primary-foreground backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(199,80%,60%,0.2),0_4px_20px_hsl(199,70%,30%,0.3)] hover:border-[hsl(199,70%,50%,0.65)] hover:bg-[linear-gradient(145deg,hsl(199,65%,25%,0.7)_0%,hsl(210,55%,18%,0.75)_50%,hsl(220,45%,12%,0.85)_100%)] hover:shadow-[inset_0_1px_1px_hsl(199,80%,70%,0.25),0_6px_28px_hsl(199,70%,35%,0.4)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(199,80%,70%,0.15)_0%,transparent_50%,hsl(199,60%,40%,0.05)_100%)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.25)]",
        outline: "border border-input bg-background hover:bg-accent/10 hover:border-accent/40 dark:hover:shadow-[0_0_15px_hsl(263,60%,60%,0.15)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent/10 dark:hover:shadow-[0_0_15px_hsl(263,60%,60%,0.15)]",
        ghost: "hover:bg-accent/10 dark:hover:shadow-[0_0_12px_hsl(263,60%,60%,0.1)]",
        link: "text-primary underline-offset-4 hover:underline hover:scale-100",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm dark:hover:shadow-[0_0_20px_hsl(263,60%,60%,0.3)]",
        success: "bg-success text-success-foreground hover:bg-success/90 shadow-sm hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]",
        hero: "bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:-translate-y-0.5 dark:hover:shadow-[0_0_25px_hsl(199,80%,55%,0.4)]",
        "hero-outline": "border-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:border-primary/60 dark:hover:shadow-[0_0_20px_hsl(199,80%,55%,0.2)]",
        gradient: "bg-[linear-gradient(135deg,hsl(270,20%,6%)_0%,hsl(265,30%,12%)_30%,hsl(268,80%,30%)_55%,hsl(270,90%,45%)_75%,hsl(265,70%,35%)_100%)] text-white hover:bg-[linear-gradient(135deg,hsl(270,20%,9%)_0%,hsl(265,30%,15%)_30%,hsl(268,80%,35%)_55%,hsl(270,90%,50%)_75%,hsl(265,70%,40%)_100%)] shadow-sm dark:hover:shadow-[0_0_20px_hsl(270,90%,45%,0.3)]",
        "liquid-glass": "relative overflow-hidden border border-[hsl(270,70%,55%,0.45)] bg-[hsl(270,50%,40%,0.25)] text-foreground backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(270,80%,80%,0.3),0_4px_24px_hsl(270,70%,35%,0.35)] hover:bg-[hsl(270,55%,40%,0.4)] hover:border-[hsl(270,70%,60%,0.6)] hover:shadow-[inset_0_1px_1px_hsl(270,80%,85%,0.4),0_6px_32px_hsl(270,70%,40%,0.45)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(270,80%,80%,0.25)_0%,transparent_50%,hsl(270,70%,55%,0.1)_100%)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8 text-base",
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
