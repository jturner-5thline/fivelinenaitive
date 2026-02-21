import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  type?: 'line' | 'bar' | 'area';
  width?: number;
  height?: number;
  color?: string;
  negativeColor?: string;
}

export function Sparkline({ data, type = 'line', width = 80, height = 18, color, negativeColor }: SparklineProps) {
  const sparkColor = color || 'hsl(var(--primary))';
  const negColor = negativeColor || 'hsl(var(--destructive))';

  const path = useMemo(() => {
    if (!data.length) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 1;
    const w = width - padding * 2;
    const h = height - padding * 2;
    const step = w / Math.max(data.length - 1, 1);

    const points = data.map((v, i) => ({
      x: padding + i * step,
      y: padding + h - ((v - min) / range) * h,
    }));

    if (type === 'line' || type === 'area') {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      if (type === 'area') {
        return `${d} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${padding} ${height - padding} Z`;
      }
      return d;
    }
    return '';
  }, [data, type, width, height]);

  if (!data.length) return null;

  if (type === 'bar') {
    const min = Math.min(...data, 0);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 1;
    const w = width - padding * 2;
    const h = height - padding * 2;
    const barW = Math.max(1, (w / data.length) - 1);
    const step = w / data.length;
    const zeroY = padding + h - ((0 - min) / range) * h;

    return (
      <svg width={width} height={height} className="inline-block align-middle">
        {data.map((v, i) => {
          const barH = ((v - 0) / range) * h;
          const y = v >= 0 ? zeroY - Math.abs(barH) : zeroY;
          return (
            <rect
              key={i}
              x={padding + i * step}
              y={y}
              width={barW}
              height={Math.abs(barH) || 0.5}
              fill={v >= 0 ? sparkColor : negColor}
              rx={0.5}
            />
          );
        })}
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      {type === 'area' && (
        <path d={path} fill={sparkColor} fillOpacity={0.15} stroke="none" />
      )}
      <path
        d={type === 'area' ? path.split(' L ').slice(0, -2).join(' L ') : path}
        fill="none"
        stroke={sparkColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (() => {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        const padding = 1;
        const w = width - padding * 2;
        const h = height - padding * 2;
        const step = w / Math.max(data.length - 1, 1);
        const lastIdx = data.length - 1;
        const x = padding + lastIdx * step;
        const y = padding + h - ((data[lastIdx] - min) / range) * h;
        return <circle cx={x} cy={y} r={2} fill={sparkColor} />;
      })()}
    </svg>
  );
}

// Parse SPARKLINE formula: =SPARKLINE(A1:A10, "line")
export function parseSparklineFormula(formula: string, sheetData: (string | number | null)[][]): { data: number[]; type: 'line' | 'bar' | 'area' } | null {
  const match = formula.match(/^=SPARKLINE\(([^,]+)(?:,\s*"?(line|bar|area)"?)?\)$/i);
  if (!match) return null;

  const rangeStr = match[1].trim();
  const type = (match[2]?.toLowerCase() as 'line' | 'bar' | 'area') || 'line';

  // Parse range like A1:A10 or A1:E1
  const rangeMatch = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!rangeMatch) return null;

  const colToIdx = (col: string) => {
    let idx = 0;
    for (let i = 0; i < col.length; i++) {
      idx = idx * 26 + (col.charCodeAt(i) - 64);
    }
    return idx - 1;
  };

  const startCol = colToIdx(rangeMatch[1].toUpperCase());
  const startRow = parseInt(rangeMatch[2]) - 1;
  const endCol = colToIdx(rangeMatch[3].toUpperCase());
  const endRow = parseInt(rangeMatch[4]) - 1;

  const data: number[] = [];
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const val = sheetData[r]?.[c];
      if (val !== null && val !== undefined) {
        const n = typeof val === 'number' ? val : parseFloat(String(val));
        if (!isNaN(n)) data.push(n);
      }
    }
  }

  return { data, type };
}
