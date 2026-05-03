/**
 * Shared design tokens that mirror the **Insights** page exactly.
 *
 * Insights renders every chart/widget/KPI inside the standard `<Card>` shell
 * from `@/components/ui/card` (which already provides the dark "liquid glass"
 * surface — `rgba(255,255,255,0.04)` bg, `rgba(255,255,255,0.08)` border,
 * blur + soft shadow). Charts use the `--primary` / `--chart-2..5` palette
 * with `stroke-border` gridlines, fontSize-11 axes, and a tooltip styled
 * with `hsl(var(--card))` background.
 *
 * Sales & BD MUST consume these same primitives so it visually reads as the
 * Insights design system, not an approximation.
 */

// Card surface: matches the standard <Card /> shell used throughout Insights.
// Use this on a plain <div> when you need the Insights card look without the
// React Card component (e.g. when you also want custom padding/layout).
export const liquidGlassCard = [
  'rounded-xl border text-card-foreground transition-all duration-200 ease-out',
  'bg-card border-border shadow-sm',
  'dark:bg-[rgba(255,255,255,0.04)] dark:border-[rgba(255,255,255,0.08)] dark:backdrop-blur-xl dark:backdrop-saturate-150',
  'dark:shadow-[0_4px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]',
].join(' ');

// Elevated KPI variant — same surface + Insights-style hover affordance.
export const liquidGlassKPI = [
  liquidGlassCard,
  'dark:hover:border-[rgba(255,255,255,0.14)]',
  'dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]',
].join(' ');

// Insights chart series palette (verbatim from src/pages/Insights.tsx COLORS).
export const LIQUID_GLASS_SERIES = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 70%, 50%)',
  'hsl(180, 60%, 45%)',
  'hsl(330, 60%, 50%)',
  'hsl(45, 70%, 50%)',
  'hsl(120, 50%, 40%)',
] as const;

// Section header — matches Insights `CardTitle` typography.
export const liquidGlassSectionTitle =
  'text-base font-semibold tracking-tight text-foreground';

// Standard Recharts styling props used throughout Insights.
export const INSIGHTS_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
} as const;

export const INSIGHTS_AXIS_TICK = { fontSize: 11 } as const;
export const INSIGHTS_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
