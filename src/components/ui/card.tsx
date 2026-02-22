import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "relative overflow-hidden rounded-lg border text-card-foreground transition-all duration-300 ease-out",
      "border-[hsl(263,40%,25%,0.6)] bg-[linear-gradient(145deg,hsl(260,20%,8%,0.85)_0%,hsl(263,18%,6%,0.9)_40%,hsl(240,15%,5%,0.95)_100%)] backdrop-blur-xl",
      "shadow-[inset_0_1px_1px_hsl(263,40%,35%,0.08),0_4px_24px_hsl(0,0%,0%,0.4)]",
      "hover:border-[hsl(263,45%,30%,0.7)] hover:bg-[linear-gradient(145deg,hsl(260,22%,10%,0.9)_0%,hsl(263,20%,7%,0.92)_40%,hsl(240,16%,6%,0.95)_100%)] hover:shadow-[inset_0_1px_1px_hsl(263,50%,45%,0.12),0_6px_32px_hsl(0,0%,0%,0.5)]",
      "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(263,40%,30%,0.08)_0%,transparent_50%,hsl(263,30%,20%,0.04)_100%)]",
      className
    )} 
    {...props} 
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
