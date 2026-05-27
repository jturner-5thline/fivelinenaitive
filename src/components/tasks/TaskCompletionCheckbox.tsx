import { useState, useCallback, useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskCompletionCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function TaskCompletionCheckbox({
  checked,
  onChange,
  disabled = false,
  className,
}: TaskCompletionCheckboxProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  // Debounce rapid clicks on adjacent rows (~300ms) so a stray scroll-click
  // on the wrong task doesn't accidentally mark it complete.
  const lastClickRef = useRef<number>(0);

  const handleClick = useCallback(() => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastClickRef.current < 300) return;
    lastClickRef.current = now;
    setIsAnimating(true);
    onChange(!checked);
    // Allow animation to finish
    setTimeout(() => setIsAnimating(false), 400);
  }, [checked, disabled, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Mark as incomplete" : "Mark as complete"}
      tabIndex={0}
      disabled={disabled}
      onClick={handleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onKeyDown={handleKeyDown}
      className={cn(
        // Large hit area, compact visual
        "relative flex items-center justify-center w-8 h-8 -m-1 rounded-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "transition-colors duration-150",
        !checked && "hover:bg-primary/10",
        checked && "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 transition-all duration-200 ease-out",
          // Unchecked
          !checked && "border-muted-foreground/50 bg-transparent",
          !checked && isHovering && "border-primary/80 bg-primary/15",
          // Checked
          checked && "border-primary bg-primary",
          // Pop animation on complete
          isAnimating && checked && "animate-task-complete-pop",
          // Ring flash
          isAnimating && checked && "shadow-[0_0_0_4px_hsl(var(--primary)/0.2)]"
        )}
      >
        {/* Check SVG with draw-in animation */}
        <svg
          viewBox="0 0 12 12"
          className={cn(
            "w-3 h-3 transition-all duration-200",
            checked
              ? "opacity-100 scale-100"
              : isHovering
                ? "opacity-60 scale-90"
                : "opacity-0 scale-50"
          )}
          fill="none"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M2.5 6.5L5 9L9.5 3.5"
            className={cn(
              checked && isAnimating && "animate-task-check-draw"
            )}
            style={{
              strokeDasharray: 12,
              strokeDashoffset: checked || isHovering ? 0 : 12,
              transition: "stroke-dashoffset 250ms ease-out 50ms",
            }}
          />
        </svg>
      </span>
    </button>
  );
}
