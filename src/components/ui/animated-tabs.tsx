import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const AnimatedTabs = TabsPrimitive.Root;

const AnimatedTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
AnimatedTabsList.displayName = TabsPrimitive.List.displayName;

const AnimatedTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
AnimatedTabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

interface AnimatedTabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {
  direction?: "left" | "right" | "none";
}

const AnimatedTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  AnimatedTabsContentProps
>(({ className, direction = "none", ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      direction === "right" && "animate-slide-in-from-right",
      direction === "left" && "animate-slide-in-from-left",
      className
    )}
    {...props}
  />
));
AnimatedTabsContent.displayName = TabsPrimitive.Content.displayName;

// Hook to track tab direction
export function useTabDirection<T extends string>(
  tabs: readonly T[],
  currentTab: T
): "left" | "right" | "none" {
  const [direction, setDirection] = React.useState<"left" | "right" | "none">("none");
  const prevTabRef = React.useRef<T>(currentTab);

  React.useEffect(() => {
    const prevIndex = tabs.indexOf(prevTabRef.current);
    const currentIndex = tabs.indexOf(currentTab);

    if (prevIndex !== currentIndex) {
      setDirection(currentIndex > prevIndex ? "right" : "left");
    }

    prevTabRef.current = currentTab;
  }, [currentTab, tabs]);

  return direction;
}

export {
  AnimatedTabs,
  AnimatedTabsList,
  AnimatedTabsTrigger,
  AnimatedTabsContent,
};
