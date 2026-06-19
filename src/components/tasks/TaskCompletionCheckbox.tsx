import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TaskCompletionCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  taskTitle?: string;
}

/**
 * Hover-preview checkbox for task rows.
 * - Unchecked: hover/focus telegraphs the completed state (fills interior
 *   ~55% + ghost checkmark ~70% + scale 1.08) over 150ms ease-out.
 * - Checked: hover/focus previews un-completion (fill drops 100% -> 40%).
 * - Click: snap to 100% + 1.15 pop pulse over 250ms ease-out-back.
 * - Honors prefers-reduced-motion (instant bg swap, no transform).
 */
export function TaskCompletionCheckbox({
  checked,
  onChange,
  disabled = false,
  className,
  taskTitle,
}: TaskCompletionCheckboxProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPreview, setIsPreview] = useState(false); // hover OR focus-visible
  const [reducedMotion, setReducedMotion] = useState(false);
  // Optimistic state so the UI flips instantly while the parent mutation resolves
  const [optimisticChecked, setOptimisticChecked] = useState<boolean | null>(null);
  // Debounce rapid clicks on adjacent rows (~600ms — covers slow network round-trips)
  const lastClickRef = useRef<number>(0);

  // Clear optimistic override once the parent prop catches up
  useEffect(() => {
    if (optimisticChecked !== null && optimisticChecked === checked) {
      setOptimisticChecked(null);
    }
  }, [checked, optimisticChecked]);

  const effectiveChecked = optimisticChecked ?? checked;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastClickRef.current < 600) return;
    lastClickRef.current = now;
    const next = !effectiveChecked;
    setOptimisticChecked(next);
    setIsAnimating(true);
    onChange(next);
    setTimeout(() => setIsAnimating(false), 280);
  }, [effectiveChecked, disabled, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const ariaLabel = taskTitle
    ? effectiveChecked
      ? `Mark '${taskTitle}' incomplete`
      : `Mark '${taskTitle}' complete`
    : effectiveChecked
      ? "Mark as incomplete"
      : "Mark as complete";

  // Easing tokens
  const easeOut = "cubic-bezier(0.16, 1, 0.3, 1)";
  const easeOutBack = "cubic-bezier(0.34, 1.56, 0.64, 1)";

  // Compute target visual state (uses optimistic value for instant feedback)
  const showPreviewFill = !effectiveChecked && isPreview && !isAnimating;
  const showPreviewUncheck = effectiveChecked && isPreview && !isAnimating;

  // Background opacity for circle interior
  let fillOpacity = 0;
  if (effectiveChecked) fillOpacity = showPreviewUncheck ? 0.4 : 1;
  else if (showPreviewFill) fillOpacity = 0.55;

  // Checkmark glyph opacity
  let glyphOpacity = 0;
  if (effectiveChecked) glyphOpacity = showPreviewUncheck ? 0.5 : 1;
  else if (showPreviewFill) glyphOpacity = 1;

  // Scale
  let scale = 1;
  if (!reducedMotion) {
    if (isAnimating) scale = 1.15;
    else if (isPreview) scale = 1.08;
  }

  // Transition timings
  const transitionDuration = reducedMotion
    ? "0ms"
    : isAnimating
      ? "250ms"
      : isPreview
        ? "150ms"
        : "120ms";
  const transitionEase = isAnimating ? easeOutBack : easeOut;

  return (
    <button
      role="checkbox"
      aria-checked={effectiveChecked}
      aria-label={ariaLabel}
      tabIndex={0}
      disabled={disabled}
      onClick={handleClick}
      onMouseEnter={() => setIsPreview(true)}
      onMouseLeave={() => setIsPreview(false)}
      onFocus={(e) => {
        // only show preview for keyboard focus
        if (e.target.matches(":focus-visible")) setIsPreview(true);
      }}
      onBlur={() => setIsPreview(false)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative flex items-center justify-center w-8 h-8 -m-1 rounded-lg cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex items-center justify-center w-[18px] h-[18px] rounded-full border-2",
          effectiveChecked || showPreviewFill
            ? "border-primary"
            : "border-muted-foreground/50"
        )}
        style={{
          backgroundColor: `hsl(var(--primary) / ${fillOpacity})`,
          transform: `scale(${scale})`,
          transition: `background-color ${transitionDuration} ${transitionEase}, transform ${transitionDuration} ${transitionEase}, border-color ${transitionDuration} ${transitionEase}, box-shadow ${transitionDuration} ${transitionEase}`,
          boxShadow: isAnimating
            ? "0 0 0 4px hsl(var(--primary) / 0.24)"
            : "none",
        }}
      >
        <svg
          viewBox="0 0 12 12"
          className="w-3 h-3"
          style={{
            opacity: glyphOpacity,
            transition: `opacity ${transitionDuration} ${transitionEase}`,
          }}
          fill="none"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5L5 9L9.5 3.5" />
        </svg>
      </span>
    </button>
  );
}
