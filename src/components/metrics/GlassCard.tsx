import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Shared "Liquid Glass" surface used across all dashboards (Weekly Rundown,
 * Executive Dashboard, Pipeline, Revenue Overview, Signed Deals & A/R,
 * Profit by Entity, Consolidated Debt Pipeline, etc.).
 *
 * One surface treatment, one radius, one border, one sheen. All dashboard
 * widgets, KPI cards, chart cards, summary modules and insight panels MUST
 * route through these primitives so the platform reads as a single design
 * system rather than several stitched-together dashboards.
 */

export const GLASS_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  border: '0.5px solid rgba(255, 255, 255, 0.14)',
  borderRadius: '12px',
};

export const GLASS_SHEEN_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  pointerEvents: 'none',
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.00) 55%)',
};

export const GLASS_TOKENS = {
  /* Typography */
  titleClass: 'text-[11px] font-medium uppercase tracking-[0.08em]',
  titleColor: 'rgba(160, 200, 255, 0.50)',
  subtitleClass: 'text-[11px] mt-1 truncate',
  subtitleColor: 'rgba(120, 170, 255, 0.45)',
  valueClass: 'text-3xl font-semibold tabular-nums leading-none tracking-tight',
  valueColor: '#dde8f8',
  metaClass: 'text-[10px] mt-1.5 uppercase tracking-wider',
  metaColor: 'rgba(120, 170, 255, 0.40)',
};

type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Adds the subtle hover lift used on interactive widgets. */
  interactive?: boolean;
  /** Hide the diagonal sheen highlight (rarely needed). */
  noSheen?: boolean;
  children?: React.ReactNode;
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, style, interactive, noSheen, children, ...rest }, ref) => {
    return (
      <Card
        ref={ref}
        style={{ ...GLASS_CARD_STYLE, ...style }}
        className={cn(
          'relative overflow-hidden backdrop-blur-xl',
          interactive &&
            'transition-all duration-200 hover:-translate-y-0.5',
          className
        )}
        {...rest}
      >
        {!noSheen && <div style={GLASS_SHEEN_STYLE} />}
        {children}
      </Card>
    );
  }
);
GlassCard.displayName = 'GlassCard';

/** Standardized header for glass cards. Use inside <GlassCard>. */
export function GlassCardHeader({
  title,
  subtitle,
  right,
  className,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <CardHeader className={cn('pb-3 pt-5 relative', className)}>
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <CardTitle
                className={GLASS_TOKENS.titleClass}
                style={{ color: GLASS_TOKENS.titleColor }}
              >
                {title}
              </CardTitle>
            )}
            {subtitle && (
              <p
                className={GLASS_TOKENS.subtitleClass}
                style={{ color: GLASS_TOKENS.subtitleColor }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </CardHeader>
  );
}

/** Standardized body wrapper. Use inside <GlassCard>. */
export function GlassCardBody({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <CardContent className={cn('relative pt-1', className)}>{children}</CardContent>
  );
}
