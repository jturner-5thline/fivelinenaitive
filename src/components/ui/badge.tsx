import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Soft pastel colors matching Airtable-style UI
        blue: "border-transparent bg-[#d0e7ff] text-[#1d4ed8] dark:bg-[#1e3a5f] dark:text-[#93c5fd]",
        green: "border-transparent bg-[#d1fae5] text-[#047857] dark:bg-[#064e3b] dark:text-[#6ee7b7]",
        purple: "border-transparent bg-[#ede9fe] text-[#6d28d9] dark:bg-[#3b0764] dark:text-[#c4b5fd]",
        amber: "border-transparent bg-[#fef3c7] text-[#b45309] dark:bg-[#451a03] dark:text-[#fcd34d]",
        pink: "border-transparent bg-[#fce7f3] text-[#be185d] dark:bg-[#500724] dark:text-[#f9a8d4]",
        cyan: "border-transparent bg-[#cffafe] text-[#0e7490] dark:bg-[#083344] dark:text-[#67e8f9]",
        peach: "border-transparent bg-[#fed7c3] text-[#c2410c] dark:bg-[#431407] dark:text-[#fdba74]",
        gray: "border-transparent bg-[#e5e7eb] text-[#374151] dark:bg-[#374151] dark:text-[#d1d5db]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
