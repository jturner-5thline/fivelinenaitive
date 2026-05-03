/**
 * Shared "Liquid Glass" design tokens — extracted from the Insights page /
 * ChannelsDashboard so every chart card, KPI tile, and widget container
 * across the platform can opt into the same visual treatment.
 *
 * Apply with: <div className={liquidGlassCard} /> or
 * <div className={liquidGlassKPI} /> for the slightly more elevated KPI variant.
 */

// Base frosted glass module (chart cards, widget containers)
export const liquidGlassCard = [
  'relative isolate rounded-xl overflow-hidden',
  // Border: double-layer rim light
  'border border-[hsl(260,40%,50%,0.12)]',
  'ring-1 ring-inset ring-white/[0.05]',
  // Background: frosted translucent layers
  'bg-[linear-gradient(145deg,hsl(260,25%,16%,0.72)_0%,hsl(255,20%,11%,0.58)_50%,hsl(250,18%,9%,0.65)_100%)]',
  'backdrop-blur-2xl backdrop-saturate-150',
  // Outer shadow: depth + glow
  'shadow-[0_2px_4px_hsl(0,0%,0%,0.2),0_8px_32px_hsl(260,40%,8%,0.5),0_0_0_1px_hsl(260,30%,40%,0.04)]',
  // Top highlight shimmer (::before)
  'before:pointer-events-none before:absolute before:inset-0 before:rounded-xl',
  'before:bg-[linear-gradient(175deg,hsl(0,0%,100%,0.07)_0%,hsl(0,0%,100%,0.02)_25%,transparent_50%)]',
  // Bottom subtle glow (::after)
  'after:pointer-events-none after:absolute after:inset-0 after:rounded-xl',
  'after:bg-[radial-gradient(ellipse_at_50%_100%,hsl(263,50%,40%,0.06)_0%,transparent_70%)]',
].join(' ');

// Elevated KPI card variant — adds hover affordance
export const liquidGlassKPI = [
  liquidGlassCard,
  'hover:border-[hsl(263,50%,55%,0.2)] hover:shadow-[0_2px_4px_hsl(0,0%,0%,0.2),0_12px_40px_hsl(260,50%,10%,0.55),0_0_20px_hsl(263,60%,50%,0.05)]',
  'hover:before:bg-[linear-gradient(175deg,hsl(0,0%,100%,0.10)_0%,hsl(0,0%,100%,0.03)_25%,transparent_50%)]',
  'transition-all duration-300',
].join(' ');

// Standard chart series palette (matches Insights / ChannelsDashboard)
export const LIQUID_GLASS_SERIES = [
  'hsl(263, 70%, 58%)',
  'hsl(280, 65%, 55%)',
  'hsl(38, 92%, 55%)',
  'hsl(160, 65%, 45%)',
  'hsl(210, 70%, 55%)',
  'hsl(340, 70%, 55%)',
] as const;

// Standard section header styling (small caps slate label)
export const liquidGlassSectionTitle =
  'text-sm font-semibold uppercase tracking-wider text-slate-400';
