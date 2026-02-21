import { cn } from '@/lib/utils';

interface FunnelChartProps {
  data: { name: string; value: number; count: number }[];
  height?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 70%, 50%)',
];

export function FunnelChart({ data, height = 240, colors = DEFAULT_COLORS }: FunnelChartProps) {
  if (data.length === 0) return null;
  const maxValue = data[0].value;

  return (
    <div className="flex flex-col gap-1" style={{ height }}>
      {data.map((item, index) => {
        const widthPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        const conversionRate = index > 0 && data[index - 1].value > 0
          ? ((item.value / data[index - 1].value) * 100).toFixed(0)
          : null;

        return (
          <div key={item.name} className="flex items-center gap-2 flex-1">
            <div className="w-24 text-right text-xs text-muted-foreground truncate" title={item.name}>
              {item.name}
            </div>
            <div className="flex-1 relative flex items-center">
              <div
                className="h-full rounded-r-md transition-all duration-500 flex items-center justify-center min-h-[28px]"
                style={{
                  width: `${Math.max(widthPercent, 8)}%`,
                  backgroundColor: colors[index % colors.length],
                }}
              >
                <span className="text-[11px] font-semibold text-white px-2 whitespace-nowrap">
                  {item.count} ({item.value > 1000000 ? `$${(item.value / 1000000).toFixed(1)}M` : `$${(item.value / 1000).toFixed(0)}k`})
                </span>
              </div>
              {conversionRate && (
                <span className="ml-2 text-[10px] text-muted-foreground whitespace-nowrap">
                  → {conversionRate}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
