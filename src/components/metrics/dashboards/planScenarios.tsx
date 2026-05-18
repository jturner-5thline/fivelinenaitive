import React from 'react';

/**
 * Shared scenario color mapping used by the Insights Forecasts and Key Metrics
 * tabs. Single source of truth for plan/scenario colors, pill styling, and the
 * compact legend toggle row.
 *
 * Color mapping (per product spec):
 *   Reach Plan   = Green
 *   Operating    = Blue
 *   Conservative = Orange
 *   Actuals      = Purple (rendered as a dotted line on charts)
 */

export type PlanKey = 'Reach' | 'Operating' | 'Conservative' | 'Actuals';
export type TogglePlanKey = 'Reach' | 'Operating' | 'Conservative';

// Solid line/series colors
export const PLAN_COLORS: Record<PlanKey, string> = {
  Reach: '#22c55e',        // green
  Operating: '#3b82f6',    // blue
  Conservative: '#f59e0b', // orange
  Actuals: '#a78bfa',      // purple
};

// Soft fill / translucent variants for bars and area fills
export const PLAN_FILLS: Record<PlanKey, string> = {
  Reach: 'rgba(34,197,94,0.35)',
  Operating: 'rgba(59,130,246,0.35)',
  Conservative: 'rgba(245,158,11,0.35)',
  Actuals: 'rgba(167,139,250,0.30)',
};

// Pill / badge style for the four scenarios
const PILL_STYLES: Record<PlanKey, React.CSSProperties> = {
  Reach:        { background: 'rgba(34,197,94,0.15)',  color: PLAN_COLORS.Reach,        border: '1px solid rgba(34,197,94,0.30)'  },
  Operating:    { background: 'rgba(59,130,246,0.15)', color: PLAN_COLORS.Operating,    border: '1px solid rgba(59,130,246,0.30)' },
  Conservative: { background: 'rgba(245,158,11,0.15)', color: PLAN_COLORS.Conservative, border: '1px solid rgba(245,158,11,0.30)' },
  Actuals:      { background: 'rgba(167,139,250,0.15)',color: PLAN_COLORS.Actuals,      border: '1px solid rgba(167,139,250,0.30)' },
};

export function PlanPill({ plan, children }: { plan: PlanKey; children?: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 9, fontWeight: 700,
        padding: '2px 8px', borderRadius: 20, ...PILL_STYLES[plan],
      }}
    >
      {children ?? (plan === 'Actuals' ? 'Actuals' : `${plan} Plan`)}
    </span>
  );
}

// Default plan visibility — all three toggle scenarios start visible.
export const DEFAULT_PLAN_VISIBILITY: Record<TogglePlanKey, boolean> = {
  Reach: true,
  Operating: true,
  Conservative: true,
};

export type PlanVisibility = Record<TogglePlanKey, boolean>;

export function usePlanVisibility(initial: PlanVisibility = DEFAULT_PLAN_VISIBILITY) {
  const [visible, setVisible] = React.useState<PlanVisibility>(initial);
  const toggle = React.useCallback(
    (key: TogglePlanKey) => setVisible(v => ({ ...v, [key]: !v[key] })),
    [],
  );
  return { visible, toggle, setVisible };
}

const TOGGLE_PLANS: TogglePlanKey[] = ['Reach', 'Operating', 'Conservative'];

/**
 * Compact legend / toggle row. Reach, Operating, Conservative are
 * click-to-toggle; Actuals is shown as an always-visible reference key with a
 * dotted-line swatch so users associate the dotted treatment with Actuals.
 */
export function PlanToggleLegend({
  visible,
  onToggle,
  className = '',
  style,
}: {
  visible: PlanVisibility;
  onToggle: (key: TogglePlanKey) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: 6, marginBottom: 10, ...style,
      }}
    >
      {TOGGLE_PLANS.map((plan) => {
        const on = visible[plan];
        const color = PLAN_COLORS[plan];
        return (
          <button
            key={plan}
            type="button"
            onClick={() => onToggle(plan)}
            aria-pressed={on}
            title={on ? `Hide ${plan} Plan` : `Show ${plan} Plan`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10, fontWeight: 600, letterSpacing: '.2px',
              background: on ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: `1px solid ${on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'}`,
              color: on ? '#e8f6ff' : 'rgba(255,255,255,0.4)',
              opacity: on ? 1 : 0.55,
              transition: 'opacity 120ms ease, background 120ms ease',
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: on ? color : 'transparent',
                border: `1.5px solid ${color}`,
                flexShrink: 0,
              }}
            />
            {`${plan} Plan`}
          </button>
        );
      })}
      {/* Actuals reference key — not toggleable */}
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 600, letterSpacing: '.2px',
          color: 'rgba(255,255,255,0.55)',
        }}
        title="Actuals are always shown as a purple dotted line"
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ width: 4, height: 2, background: PLAN_COLORS.Actuals }} />
          <span style={{ width: 4, height: 2, background: PLAN_COLORS.Actuals }} />
          <span style={{ width: 4, height: 2, background: PLAN_COLORS.Actuals }} />
        </span>
        Actuals
      </span>
    </div>
  );
}

// Helper: map a free-form plan label ("Reach", "Operating", "Conservative",
// "Actuals") to the canonical color, falling back to a neutral tone.
export function planColorFor(label: string): string {
  if (label.startsWith('Reach')) return PLAN_COLORS.Reach;
  if (label.startsWith('Operating')) return PLAN_COLORS.Operating;
  if (label.startsWith('Conservative')) return PLAN_COLORS.Conservative;
  if (label.startsWith('Actuals')) return PLAN_COLORS.Actuals;
  return 'rgba(255,255,255,0.5)';
}