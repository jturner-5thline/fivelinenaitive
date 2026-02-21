import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface WaterfallChartProps {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
}

export function WaterfallChart({ data, height = 240, color = 'hsl(var(--primary))' }: WaterfallChartProps) {
  const processedData = useMemo(() => {
    let cumulative = 0;
    return data.map((item, index) => {
      const isTotal = index === data.length - 1;
      const start = isTotal ? 0 : cumulative;
      const end = isTotal ? item.value : cumulative + item.value;
      cumulative += isTotal ? 0 : item.value;
      return {
        name: item.name,
        value: item.value,
        start: Math.min(start, end),
        barHeight: Math.abs(end - start),
        isPositive: item.value >= 0,
        isTotal,
      };
    });
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={processedData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`$${(value / 1000).toFixed(1)}k`, 'Value']}
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        {/* Invisible base bar */}
        <Bar dataKey="start" stackId="waterfall" fill="transparent" />
        {/* Visible bar */}
        <Bar dataKey="barHeight" stackId="waterfall" radius={[4, 4, 0, 0]}>
          {processedData.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.isTotal ? color : entry.isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
