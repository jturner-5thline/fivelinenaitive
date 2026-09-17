import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * naitive typography primitives.
 * Every semantic text role in the design system has exactly one component.
 * Inter everywhere; JetBrains Mono only for identifiers, currency,
 * timestamps and dense KPI figures (MonoId / MonoValue).
 */

type El = React.HTMLAttributes<HTMLElement> & { as?: keyof JSX.IntrinsicElements };

function make(role: string, defaultTag: keyof JSX.IntrinsicElements) {
  const Comp = React.forwardRef<HTMLElement, El>(({ as, className, ...props }, ref) => {
    const Tag = (as ?? defaultTag) as React.ElementType;
    return <Tag ref={ref} className={cn(role, className)} {...props} />;
  });
  Comp.displayName = role;
  return Comp;
}

export const PageTitle = make("text-role-display", "h1");
export const SectionHeading = make("text-role-section", "h2");
export const CardHeading = make("text-role-card-title", "h3");
export const Body = make("text-role-body", "p");
export const BodyCompact = make("text-role-body-compact", "p");
export const FormLabel = make("text-role-label", "span");
export const Caption = make("text-role-caption", "span");
export const UIText = make("text-role-ui", "span");
export const TableHeadText = make("text-role-table-head", "span");

/** Record identifiers (deal IDs, reference codes). */
export const MonoId = make("text-role-mono-id", "span");
/** Currency, financial figures, timestamps, KPI values. */
export const MonoValue = make("text-role-mono-value", "span");
