/**
 * Refined Glass Pie/Donut cell renderer for Recharts.
 * Subtle depth and polish without overpowering the data.
 */
import { useId } from 'react';
import { Sector } from 'recharts';

/** Custom active shape for Pie with restrained glass effect */
export function GlassActiveShape(props: Record<string, unknown>) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill,
  } = props as {
    cx: number; cy: number; innerRadius: number; outerRadius: number;
    startAngle: number; endAngle: number; fill: string;
  };

  return (
    <g>
      {/* Subtle outer glow on hover */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 1}
        outerRadius={(outerRadius as number) + 4}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill} opacity={0.12}
      />
      {/* Main sector */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill} opacity={0.82}
      />
      {/* Subtle inner rim */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={innerRadius + 2}
        startAngle={startAngle} endAngle={endAngle}
        fill="white" opacity={0.08}
      />
    </g>
  );
}

/**
 * SVG defs block for pie charts – restrained radial glass overlay.
 * Place inside the PieChart component.
 */
export function PieGlassDefs({ colors }: { colors: string[] }) {
  return (
    <defs>
      {colors.map((color, i) => (
        <radialGradient key={i} id={`pie-glass-${i}`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity={0.1} />
          <stop offset="40%" stopColor={color} stopOpacity={0.78} />
          <stop offset="100%" stopColor={color} stopOpacity={0.65} />
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
