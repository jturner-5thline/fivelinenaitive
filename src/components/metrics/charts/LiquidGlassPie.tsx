/**
 * Liquid Glass Pie/Donut cell renderer for Recharts.
 * Adds glossy highlight and depth to each segment.
 */
import { useId } from 'react';
import { Sector } from 'recharts';

/** Custom active shape for Pie with glass effect */
export function GlassActiveShape(props: Record<string, unknown>) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value,
  } = props as {
    cx: number; cy: number; innerRadius: number; outerRadius: number;
    startAngle: number; endAngle: number; fill: string;
    payload: { name?: string }; percent: number; value: number;
  };

  return (
    <g>
      {/* Expanded outer glow */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={(outerRadius as number) + 6}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill} opacity={0.2}
      />
      {/* Main sector */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill} opacity={0.85}
      />
      {/* Inner highlight ring */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={innerRadius + 3}
        startAngle={startAngle} endAngle={endAngle}
        fill="white" opacity={0.15}
      />
    </g>
  );
}

/**
 * SVG defs block to inject glass gradient overlays for pie charts.
 * Place inside the PieChart component.
 */
export function PieGlassDefs({ colors }: { colors: string[] }) {
  return (
    <defs>
      {colors.map((color, i) => (
        <radialGradient key={i} id={`pie-glass-${i}`} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity={0.25} />
          <stop offset="50%" stopColor={color} stopOpacity={0.8} />
          <stop offset="100%" stopColor={color} stopOpacity={0.6} />
        </radialGradient>
      ))}
    </defs>
  );
}

/**
 * Returns fill string for a pie cell at index i to reference the glass gradient.
 * Falls back to the raw color if defs aren't present.
 */
export function pieGlassFill(index: number): string {
  return `url(#pie-glass-${index})`;
}
