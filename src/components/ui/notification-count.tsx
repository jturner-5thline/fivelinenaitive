import * as React from "react";
import { cn } from "@/lib/utils";

export interface NotificationCountProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** The unread / pending / alert quantity. */
  count: number;
  /** Values above this render as `{max}+`. */
  max?: number;
  /** Render even when the count is zero. */
  showZero?: boolean;
}

/**
 * Shared notification-count badge: solid red, white bold text, centered,
 * circular for a single digit and a compact pill for 2+ characters.
 * Visual styling lives in the `.notif-count` rule in index.css.
 */
export const NotificationCount = React.forwardRef<
  HTMLSpanElement,
  NotificationCountProps
>(({ count, max = 99, showZero = false, className, ...props }, ref) => {
  if (!showZero && !(count > 0)) return null;
  const label = count > max ? `${max}+` : String(count);
  return (
    <span ref={ref} className={cn("notif-count", className)} {...props}>
      {label}
    </span>
  );
});
NotificationCount.displayName = "NotificationCount";
