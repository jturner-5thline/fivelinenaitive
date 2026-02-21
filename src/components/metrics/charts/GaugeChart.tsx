import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface GaugeChartProps {
  value: number;
  max?: number;
  target?: number;
  label: string;
  height?: number;
  zones?: { min: number; max: number; color: string }[];
}

const DEFAULT_ZONES = [
  { min: 0, max: 33, color: 'hsl(var(--destructive))' },
  { min: 33, max: 66, color: 'hsl(var(--warning, 45 93% 47%))' },
  { min: 66, max: 100, color: 'hsl(var(--success))' },
];

export function GaugeChart({ value, max = 100, target, label, height = 200, zones = DEFAULT_ZONES }: GaugeChartProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const gaugeAngle = 180;

  // Create gauge segments
  const getColor = () => {
    for (const zone of zones) {
      if (percentage >= zone.min && percentage <= zone.max) return zone.color;
    }
    return 'hsl(var(--muted-foreground))';
  };

  const needleData = [
    { value: percentage, color: getColor() },
    { value: 100 - percentage, color: 'hsl(var(--muted))' },
  ];

  return (
    <div className="flex flex-col items-center">
      <div style={{ height: height * 0.7, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={needleData}
              cx="50%"
              cy="90%"
              startAngle={180}
              endAngle={0}
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              {needleData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-4">
        <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {target !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            Target: {target.toLocaleString()} ({((value / target) * 100).toFixed(0)}%)
          </p>
        )}
      </div>
    </div>
  );
}
