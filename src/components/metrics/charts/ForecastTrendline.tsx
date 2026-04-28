import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface ForecastTrendlineProps {
  data: { month: string; actual: number; forecast?: number; upper?: number; lower?: number }[];
  height?: number;
  color?: string;
  target?: number;
}

export function ForecastTrendline({ data, height = 240, color = 'hsl(var(--primary))', target }: ForecastTrendlineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, name: string) => [`$${(value / 1000).toFixed(1)}k`, name]}
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
        />
        <Legend />
        {/* Confidence band */}
        <Area
          type="monotone"
          dataKey="upper"
          stroke="none"
          fill={`${color}15`}
          name="Upper Bound"
          dot={false}
          activeDot={false}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="lower"
          stroke="none"
          fill="hsl(var(--background))"
          name="Lower Bound"
          dot={false}
          activeDot={false}
          legendType="none"
        />
        {/* Actual line */}
        <Line
          type="monotone"
          dataKey="actual"
          stroke={color}
          strokeWidth={1}
          dot={{ r: 3 }}
          name="Actual"
        />
        {/* Forecast line */}
        <Line
          type="monotone"
          dataKey="forecast"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="5 5"
          dot={{ r: 3, strokeDasharray: '' }}
          name="Forecast"
        />
        {target && (
          <ReferenceLine
            y={target}
            stroke="hsl(var(--destructive))"
            strokeDasharray="3 3"
            label={{ value: `Target: $${(target / 1000).toFixed(0)}k`, position: 'right', fontSize: 10 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
