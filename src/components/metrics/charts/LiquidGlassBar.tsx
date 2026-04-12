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

  if (width <= 0 || height <= 0) return null;

  const r = isTopSegment ? Math.min(radius, width / 2, height / 2) : 0;

  // Build a rounded-top-corners rect path
  const path =
    `M${x},${y + height}` +
    `V${y + r}` +
    `Q${x},${y} ${x + r},${y}` +
    `H${x + width - r}` +
    `Q${x + width},${y} ${x + width},${y + r}` +
    `V${y + height}` +
    `Z`;

  const gradId = `glass-grad-${uid}`;
  const highlightId = `glass-hi-${uid}`;

  return (
    <g>
      <defs>
        {/* Main gradient: lighter at top, slightly transparent at bottom */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={0.95} />
          <stop offset="40%" stopColor={fill} stopOpacity={0.75} />
          <stop offset="100%" stopColor={fill} stopOpacity={0.55} />
        </linearGradient>
        {/* Internal highlight: white shimmer at the very top */}
        <linearGradient id={highlightId} x1="0" y1="0" x2="0" y2="1">
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

      {/* Thin top edge highlight */}
      {isTopSegment && height > 4 && (
        <rect
          x={x + 2}
          y={y + 1}
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
