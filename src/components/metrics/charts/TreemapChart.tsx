import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

interface TreemapChartProps {
  data: { name: string; size: number; children?: { name: string; size: number }[] }[];
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
  'hsl(180, 60%, 45%)',
  'hsl(330, 60%, 50%)',
];

function CustomTreemapContent(props: any) {
  const { x, y, width, height, name, value, index, colors: c } = props;
  const palette = c || DEFAULT_COLORS;
  if (!width || width < 30 || !height || height < 20) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={palette[index % palette.length]} stroke="hsl(var(--background))" strokeWidth={2} rx={4} />
      {width > 60 && height > 30 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight="bold">
            {(name || '').length > 12 ? (name || '').slice(0, 10) + '…' : name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>
            ${((value || 0) / 1000000).toFixed(1)}M
          </text>
        </>
      )}
    </g>
  );
}

export function TreemapChart({ data, height = 240, colors = DEFAULT_COLORS }: TreemapChartProps) {
  const treemapData = data.map(item => ({
    name: item.name,
    children: item.children || [{ name: item.name, size: item.size }],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={treemapData}
        dataKey="size"
        nameKey="name"
        aspectRatio={4 / 3}
        stroke="hsl(var(--background))"
        content={<CustomTreemapContent colors={colors} />}
      >
        <Tooltip
          formatter={(value: number) => [`$${(value / 1000000).toFixed(2)}M`, 'Value']}
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}
