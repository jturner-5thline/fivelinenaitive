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

// Card surface: delegates to the canonical `.glass-module` utility defined in
// `src/index.css` — the single, unified dashboard module surface used by every
// KPI card, chart card, widget, summary module, and insight panel on /insights.
// Per the project memory ("Liquid Glass Specs"), there is exactly ONE Insights
// surface treatment — do not introduce variants.
export const liquidGlassCard = 'glass-module';

// Elevated KPI variant — same surface + Insights-style hover affordance.
export const liquidGlassKPI = 'glass-module glass-module-interactive';

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
