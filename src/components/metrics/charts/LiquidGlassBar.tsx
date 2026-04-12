/**
 * Liquid Glass Bar Shape for Recharts
 * Renders bars with glossy glass-like appearance: gradient fill, internal highlight, subtle shadow.
 * Handles stacked bars: only the topmost visible segment gets rounded top corners.
 */
import { useId } from 'react';

export interface LiquidGlassBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** If this bar is the topmost visible segment in a stack */
  isTopSegment?: boolean;
  /** Corner radius for exposed top corners */
  radius?: number;
  /** Recharts passes payload, index, etc. */
  [key: string]: unknown;
}

/** Parse an HSL string and return { h, s, l } or null */
function parseHSL(color: string): { h: number; s: number; l: number } | null {
  // Match hsl(210, 70%, 50%) or hsl(var(--primary))
  const match = color.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)/);
  if (match) return { h: +match[1], s: +match[2], l: +match[3] };
  return null;
}

export function LiquidGlassBar(props: LiquidGlassBarProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    fill = 'hsl(var(--primary))',
    isTopSegment = true,
    radius = 4,
  } = props;

  const uid = useId().replace(/:/g, '');

  if (width <= 0 || height === 0) return null;

  const isNegative = height < 0;
  const absHeight = Math.abs(height);
  const r = isTopSegment ? Math.min(radius, width / 2, absHeight / 2) : 0;

  // For negative bars: y is the baseline (top of bar), bar extends downward by absHeight
  // For positive bars: y is the top of the bar, bar extends downward by height
  let path: string;
  if (isNegative) {
    // Bar goes from y (baseline) down to y + absHeight
    // Round the BOTTOM corners (the exposed end)
    if (isTopSegment && r > 0) {
      path =
        `M${x},${y}` +
        `H${x + width}` +
        `V${y + absHeight - r}` +
        `Q${x + width},${y + absHeight} ${x + width - r},${y + absHeight}` +
        `H${x + r}` +
        `Q${x},${y + absHeight} ${x},${y + absHeight - r}` +
        `V${y}` +
        `Z`;
    } else {
      path = `M${x},${y}H${x + width}V${y + absHeight}H${x}Z`;
    }
  } else {
    // Positive bar: round top corners
    path =
      `M${x},${y + absHeight}` +
      `V${y + r}` +
      `Q${x},${y} ${x + r},${y}` +
      `H${x + width - r}` +
      `Q${x + width},${y} ${x + width},${y + r}` +
      `V${y + absHeight}` +
      `Z`;
  }

  const gradId = `glass-grad-${uid}`;
  const highlightId = `glass-hi-${uid}`;

  // For negative bars, flip the gradient direction
  const gradY1 = isNegative ? '1' : '0';
  const gradY2 = isNegative ? '0' : '1';

  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1={gradY1} x2="0" y2={gradY2}>
          <stop offset="0%" stopColor={fill} stopOpacity={0.95} />
          <stop offset="40%" stopColor={fill} stopOpacity={0.75} />
          <stop offset="100%" stopColor={fill} stopOpacity={0.55} />
        </linearGradient>
        <linearGradient id={highlightId} x1="0" y1={gradY1} x2="0" y2={gradY2}>
          <stop offset="0%" stopColor="white" stopOpacity={0.35} />
          <stop offset="30%" stopColor="white" stopOpacity={0.08} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Shadow layer */}
      <path d={path} fill={fill} opacity={0.15} transform="translate(1, 2)" />

      {/* Base glass fill */}
      <path d={path} fill={`url(#${gradId})`} />

      {/* Internal highlight overlay */}
      <path d={path} fill={`url(#${highlightId})`} />

      {/* Thin edge highlight */}
      {isTopSegment && absHeight > 4 && (
        <rect
          x={x + 2}
          y={isNegative ? y + absHeight - 2 : y + 1}
          width={Math.max(0, width - 4)}
          height={1}
          rx={0.5}
          fill="white"
          opacity={0.3}
        />
      )}
    </g>
  );
}

/**
 * Creates a LiquidGlassBar shape function for use as <Bar shape={...} />.
 * For stacked bars, pass stackId and the dataKey of the top-most series.
 */
export function createGlassBarShape(options?: {
  radius?: number;
  /** dataKey of the topmost segment in a stack – only that segment gets rounded corners */
  topSegmentKey?: string;
  /** current bar's dataKey */
  dataKey?: string;
}) {
  const { radius = 4, topSegmentKey, dataKey } = options || {};

  return (props: Record<string, unknown>) => {
    const isTop = topSegmentKey
      ? dataKey === topSegmentKey
      : true;
    return <LiquidGlassBar {...props} radius={radius} isTopSegment={isTop} />;
  };
}
