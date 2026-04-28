import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface RadarChartProps {
  data: { subject: string; [key: string]: string | number }[];
  dataKeys: { key: string; color: string; name: string }[];
  height?: number;
}

export function RadarChart({ data, dataKeys, height = 240 }: RadarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <PolarRadiusAxis angle={30} tick={{ fontSize: 9 }} />
        {dataKeys.map((dk) => (
          <Radar
            key={dk.key}
            name={dk.name}
            dataKey={dk.key}
            stroke={dk.color}
            fill={dk.color}
            fillOpacity={0.15}
            strokeWidth={1}
          />
        ))}
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
        />
        <Legend />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
