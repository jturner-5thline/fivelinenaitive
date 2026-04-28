/**
 * Refined Glass Bar Shape for Recharts
 * Renders bars with a subtle, premium glass treatment: restrained gradient fill,
 * minimal internal highlight, and soft shadow. Optimized for analytical readability.
 * Handles stacked bars: only the topmost visible segment gets rounded top corners.
 */
import { useId } from 'react';

export interface LiquidGlassBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  baselineY?: number;
  clipRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fill?: string;
  /** If this bar is the topmost visible segment in a stack */
  isTopSegment?: boolean;
  /** Corner radius for exposed top corners */
  radius?: number;
  /** Explicit sign override (used when Recharts hands us a positive height for negative values) */
  valueSign?: 'positive' | 'negative';
  /** Recharts passes payload, index, etc. */
  [key: string]: unknown;
}

export function LiquidGlassBar(props: LiquidGlassBarProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    clipRect,
    fill = 'hsl(var(--primary))',
    isTopSegment = true,
    radius = 3,
    valueSign,
  } = props;

  const uid = useId().replace(/:/g, '');

  if (width <= 0 || height === 0) return null;

  // Recharts emits a *positive* height for negative-value bars when the y-axis
  // crosses zero (the bar is positioned at the zero baseline and extends down).
  // Trust an explicit `valueSign` override when provided, otherwise fall back to
  // the height sign (which only catches inverted-axis cases).
  const isNegative = valueSign ? valueSign === 'negative' : height < 0;
  const absHeight = Math.abs(height);
  const r = isTopSegment ? Math.min(radius, width / 2, absHeight / 2) : 0;

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
  const clipPathId = clipRect ? `glass-clip-${uid}` : undefined;

  // Flip the gradient + highlight so the "lit" edge is always on the *exposed*
  // end of the bar (top for positives, bottom for negatives).
  const gradY1 = isNegative ? '1' : '0';
  const gradY2 = isNegative ? '0' : '1';

  return (
    <g clipPath={clipPathId ? `url(#${clipPathId})` : undefined}>
      <defs>
        {clipRect ? (
          <clipPath id={clipPathId}>
            <rect
              x={clipRect.x}
              y={clipRect.y}
              width={clipRect.width}
              height={clipRect.height}
            />
          </clipPath>
        ) : null}
        {/* Subtle top-to-bottom gradient – restrained opacity range */}
        <linearGradient id={gradId} x1="0" y1={gradY1} x2="0" y2={gradY2}>
          <stop offset="0%" stopColor={fill} stopOpacity={0.88} />
          <stop offset="100%" stopColor={fill} stopOpacity={0.68} />
        </linearGradient>
        {/* Single restrained highlight at top */}
        <linearGradient id={highlightId} x1="0" y1={gradY1} x2="0" y2={gradY2}>
          <stop offset="0%" stopColor="white" stopOpacity={0.14} />
          <stop offset="25%" stopColor="white" stopOpacity={0.03} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Soft shadow – very subtle */}
      <path d={path} fill={fill} opacity={0.08} transform="translate(0.5, 1)" />

      {/* Base fill */}
      <path d={path} fill={`url(#${gradId})`} />

      {/* Internal highlight overlay */}
      <path d={path} fill={`url(#${highlightId})`} />
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
  /** Field on the data payload to inspect for sign (defaults to props.value / dataKey) */
  valueKey?: string;
}) {
  const { radius = 3, topSegmentKey, dataKey, valueKey } = options || {};

  return (props: Record<string, unknown>) => {
    const isTop = topSegmentKey
      ? dataKey === topSegmentKey
      : true;

    // Resolve the underlying datum value so we can detect negatives even when
    // Recharts hands us a positive `height` (its standard behaviour for bars
    // crossing a zero baseline).
    const payload = (props.payload ?? {}) as Record<string, unknown>;
    const rechartsValue = props.value as number | undefined;
    const lookupKey = valueKey ?? dataKey;
    const datumValue =
      typeof rechartsValue === 'number'
        ? rechartsValue
        : (lookupKey ? Number(payload[lookupKey]) : NaN);
    const valueSign: 'positive' | 'negative' | undefined =
      Number.isFinite(datumValue) ? (datumValue < 0 ? 'negative' : 'positive') : undefined;

    const yAxis = props.yAxis as {
      scale?: (value: number) => number;
      y?: number;
      height?: number;
    } | undefined;
    const background = props.background as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    } | undefined;

    let anchoredY = Number(props.y ?? 0);
    let anchoredHeight = Math.abs(Number(props.height ?? 0));

    if (typeof yAxis?.scale === 'function' && Number.isFinite(datumValue)) {
      const zeroBaselineY = Number(yAxis.scale(0));
      const valueY = Number(yAxis.scale(datumValue));
      const plotTop = Number(background?.y ?? yAxis.y ?? 0);
      const plotHeight = Number(background?.height ?? yAxis.height ?? 0);
      const plotBottom = plotTop + plotHeight;

      if (
        Number.isFinite(zeroBaselineY)
        && Number.isFinite(valueY)
        && Number.isFinite(plotTop)
        && Number.isFinite(plotBottom)
      ) {
        anchoredY = Math.max(plotTop, Math.min(zeroBaselineY, valueY));
        const anchoredBottom = Math.min(plotBottom, Math.max(zeroBaselineY, valueY));
        anchoredHeight = Math.max(0, anchoredBottom - anchoredY);
      }
    }

    return (
      <LiquidGlassBar
        {...props}
        y={anchoredY}
        height={anchoredHeight}
        radius={radius}
        isTopSegment={isTop}
        valueSign={valueSign}
        clipRect={
          background
            ? {
                x: Number(background.x ?? props.x ?? 0),
                y: Number(background.y ?? yAxis?.y ?? 0),
                width: Number(background.width ?? props.width ?? 0),
                height: Number(background.height ?? yAxis?.height ?? 0),
              }
            : undefined
        }
      />
    );
  };
}
