import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "relative overflow-hidden rounded-lg border text-card-foreground transition-all duration-300 ease-out",
      "border-[hsl(263,40%,25%,0.6)] bg-[linear-gradient(135deg,hsl(270,20%,6%)_0%,hsl(265,30%,12%)_30%,hsl(268,80%,30%)_55%,hsl(270,90%,45%)_75%,hsl(265,70%,35%)_100%)] backdrop-blur-xl",
      "shadow-[inset_0_1px_1px_hsl(263,40%,35%,0.08),0_4px_24px_hsl(0,0%,0%,0.4)]",
      "hover:border-[hsl(263,45%,30%,0.7)] hover:bg-[linear-gradient(135deg,hsl(270,20%,9%)_0%,hsl(265,30%,15%)_30%,hsl(268,80%,35%)_55%,hsl(270,90%,50%)_75%,hsl(265,70%,40%)_100%)] hover:shadow-[inset_0_1px_1px_hsl(270,50%,45%,0.12),0_6px_32px_hsl(270,90%,45%,0.2)]",
      "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(315deg,hsl(263,40%,30%,0.08)_0%,transparent_50%,hsl(263,30%,20%,0.04)_100%)]",
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
