import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "relative overflow-hidden rounded-lg border text-card-foreground transition-all duration-300 ease-out",
      "border-[hsl(272,100%,80%,0.35)] bg-[linear-gradient(145deg,hsl(222,30%,18%)_0%,hsl(230,25%,14%)_50%,hsl(238,22%,11%)_100%)] backdrop-blur-xl",
      "shadow-[inset_0_1px_2px_hsl(272,100%,80%,0.15),inset_0_-1px_1px_hsl(0,0%,0%,0.2),0_0_12px_hsl(272,100%,70%,0.1),0_6px_28px_hsl(0,0%,0%,0.5)]",
      "hover:border-[hsl(272,100%,80%,0.55)] hover:shadow-[inset_0_1px_2px_hsl(272,100%,85%,0.2),inset_0_-1px_1px_hsl(0,0%,0%,0.25),0_0_20px_hsl(272,100%,70%,0.18),0_10px_40px_hsl(0,0%,0%,0.6)]",
      "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(272,80%,75%,0.08)_0%,transparent_40%,hsl(268,60%,50%,0.04)_100%)]",
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
