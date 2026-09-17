import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium leading-tight tracking-[0.02em] transition-colors focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ds-sky)/0.45)]",
  {
    variants: {
      variant: {
        default: "border-[hsl(var(--ds-sky)/0.35)] bg-[hsl(var(--ds-sky)/0.12)] text-[hsl(var(--ds-sky))]",
        secondary: "border-border/70 bg-white/[0.04] text-muted-foreground",
        destructive:
          "border-[hsl(var(--status-critical)/0.4)] bg-[hsl(var(--status-critical)/0.14)] text-[hsl(var(--status-critical))]",
        outline: "text-foreground border-border/70 bg-transparent",
        beta: "border-[hsl(var(--ds-indigo)/0.4)] bg-[hsl(var(--ds-indigo)/0.14)] text-[hsl(var(--ds-indigo))] text-[10px]",
        /* Status = position on the spectrum */
        info: "border-[hsl(var(--status-info)/0.4)] bg-[hsl(var(--status-info)/0.12)] text-[hsl(var(--status-info))]",
        active: "border-[hsl(var(--status-active)/0.4)] bg-[hsl(var(--status-active)/0.12)] text-[hsl(var(--status-active))]",
        review: "border-[hsl(var(--status-review)/0.4)] bg-[hsl(var(--status-review)/0.14)] text-[hsl(var(--status-review))]",
        critical:
          "border-[hsl(var(--status-critical)/0.4)] bg-[hsl(var(--status-critical)/0.14)] text-[hsl(var(--status-critical))]",
        /* Legacy hue aliases remapped onto the spectrum */
        blue: "border-[hsl(var(--ds-blue)/0.4)] bg-[hsl(var(--ds-blue)/0.12)] text-[hsl(var(--ds-blue))]",
        green: "border-[hsl(var(--ds-cyan)/0.4)] bg-[hsl(var(--ds-cyan)/0.12)] text-[hsl(var(--ds-cyan))]",
        purple: "border-[hsl(var(--ds-violet)/0.4)] bg-[hsl(var(--ds-violet)/0.12)] text-[hsl(var(--ds-violet))]",
        amber: "border-[hsl(var(--ds-indigo)/0.4)] bg-[hsl(var(--ds-indigo)/0.12)] text-[hsl(var(--ds-indigo))]",
        pink: "border-[hsl(var(--ds-violet)/0.4)] bg-[hsl(var(--ds-violet)/0.12)] text-[hsl(var(--ds-violet))]",
        cyan: "border-[hsl(var(--ds-cyan)/0.4)] bg-[hsl(var(--ds-cyan)/0.12)] text-[hsl(var(--ds-cyan))]",
        peach: "border-[hsl(var(--ds-indigo)/0.4)] bg-[hsl(var(--ds-indigo)/0.12)] text-[hsl(var(--ds-indigo))]",
        gray: "border-border/70 bg-white/[0.04] text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
    );
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
