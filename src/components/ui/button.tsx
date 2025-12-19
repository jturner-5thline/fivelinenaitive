import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:scale-[1.02] active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-brand-gradient hover:shadow-[0_0_20px_hsl(292,46%,72%,0.4)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.25)]",
        outline: "border border-input bg-background hover:bg-brand-gradient/10 hover:border-[hsl(292,46%,72%)]/40 hover:shadow-[0_0_15px_hsl(292,46%,72%,0.2)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-brand-gradient/10 hover:shadow-[0_0_15px_hsl(292,46%,72%,0.2)]",
        ghost: "hover:bg-brand-gradient/10 hover:shadow-[0_0_12px_hsl(292,46%,72%,0.15)]",
        link: "text-primary underline-offset-4 hover:underline hover:scale-100",
        accent: "bg-accent text-accent-foreground hover:bg-brand-gradient hover:text-white shadow-sm hover:shadow-[0_0_20px_hsl(292,46%,72%,0.4)]",
        success: "bg-success text-success-foreground hover:bg-success/90 shadow-sm hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]",
        hero: "bg-primary text-primary-foreground hover:bg-brand-gradient shadow-lg hover:shadow-[0_4px_25px_hsl(292,46%,72%,0.5)] hover:-translate-y-0.5",
        "hero-outline": "border-2 border-primary bg-transparent text-primary hover:bg-brand-gradient/10 hover:border-[hsl(292,46%,72%)]/60 hover:shadow-[0_0_20px_hsl(292,46%,72%,0.3)]",
        gradient: "bg-brand-gradient text-white hover:bg-brand-gradient-hover shadow-sm hover:shadow-[0_0_25px_hsl(292,46%,72%,0.5)]",
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
