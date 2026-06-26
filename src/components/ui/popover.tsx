import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { OverlayContainerContext } from "@/components/ui/overlay-container-context";

const Popover = PopoverPrimitive.Root;
const PopoverPortal = PopoverPrimitive.Portal;

const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(({ className, align = "center", sideOffset = 4, container, ...props }, ref) => {
  const overlayContainer = React.useContext(OverlayContainerContext);
  // Any caller can opt out of the default dark gradient surface by passing
  // their own surface class. Default = opaque dark gradient (no transparency).
  const usesExplicitSurface =
    typeof className === "string" &&
    (className.includes("create-deal-dropdown-content") ||
      className.includes("app-dropdown-surface") ||
      className.includes("bg-transparent"));

  return (
    <PopoverPortal container={container ?? overlayContainer ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Sits above Dialog (z-1310) AND the floating Ask nAItive chat bar
          // (z-[2147483000]) so popovers opened from inside dialogs remain
          // visible. Radix portals to <body>; only z-stacking matters here.
          "pointer-events-auto z-[2147483100] w-72 rounded-md border p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          !usesExplicitSurface && "app-dropdown-surface",
          className,
        )}
        {...props}
      />
    </PopoverPortal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverPortal, PopoverTrigger, PopoverAnchor, PopoverContent };
