import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface BulletChartProps {
  actual: number;
  target: number;
  ranges: [number, number, number]; // [poor, satisfactory, good]
  label: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export function BulletChart({ actual, target, ranges, label, height = 80, formatValue }: BulletChartProps) {
  const fmt = formatValue || ((v: number) => v.toLocaleString());
  const maxVal = Math.max(ranges[2], actual, target) * 1.1;

  const rangeData = [
    { name: 'poor', value: ranges[0] },
    { name: 'satisfactory', value: ranges[1] - ranges[0] },
    { name: 'good', value: ranges[2] - ranges[1] },
  ];

  const actualData = [{ name: label, value: actual }];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-bold">{fmt(actual)}</span>
      </div>
      <div className="relative" style={{ height }}>
        {/* Background ranges */}
        <div className="absolute inset-0 flex rounded overflow-hidden">
          <div className="h-full bg-destructive/20" style={{ width: `${(ranges[0] / maxVal) * 100}%` }} />
          <div className="h-full bg-warning/20" style={{ width: `${((ranges[1] - ranges[0]) / maxVal) * 100}%` }} />
          <div className="h-full bg-success/20" style={{ width: `${((ranges[2] - ranges[1]) / maxVal) * 100}%` }} />
        </div>
        {/* Actual bar */}
        <div
          className="absolute top-1/4 h-1/2 bg-foreground rounded"
          style={{ width: `${(actual / maxVal) * 100}%` }}
        />
        {/* Target marker */}
        <div
          className="absolute top-[10%] h-[80%] w-0.5 bg-destructive"
          style={{ left: `${(target / maxVal) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>Target: {fmt(target)}</span>
        <span className={actual >= target ? 'text-success' : 'text-destructive'}>
          {actual >= target ? '✓ On track' : '✗ Below target'}
        </span>
      </div>
    </div>
  );
}
