import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Shared icon-only button with a polished accessible tooltip.
 *
 * - `label` is the single source of truth: it becomes both the visible
 *   tooltip text and the button's `aria-label`. Title attribute is added
 *   as a fallback for environments where the Radix portal can't render.
 * - Tooltip surfaces on hover AND keyboard focus (Radix default).
 * - Renders via portal, so it is never clipped by overflow-hidden parents
 *   (copilot popup header, modal headers, side rail, etc.) and always
 *   sits above modals/popovers via z-[100].
 * - Touch devices: long-press still surfaces the aria-label; no sticky
 *   hover state is applied.
 */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** The icon element to render (lucide icon, image, etc.) */
  icon: React.ReactNode;
  /** Tooltip text + aria-label (single source of truth). */
  label: string;
  /** Tooltip side. Defaults to "bottom" for top toolbars/headers. */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Tooltip alignment. Defaults to "center". */
  tooltipAlign?: "start" | "center" | "end";
  /** Disable the tooltip while keeping the button (rare). */
  hideTooltip?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      label,
      tooltipSide = "bottom",
      tooltipAlign = "center",
      hideTooltip,
      className,
      type = "button",
      ...rest
    },
    ref,
  ) => {
    const button = (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );

    if (hideTooltip) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide} align={tooltipAlign}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";