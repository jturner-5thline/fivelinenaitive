import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Deal, DealStage, STAGE_CONFIG } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealStages } from '@/contexts/DealStagesContext';

interface StageProgressionProps {
  deals: Deal[];
}

// Convert Tailwind bg color to HSL for Recharts
const bgColorToHsl = (bgColor: string): string => {
  const colorMap: Record<string, string> = {
    'bg-slate-500': 'hsl(215, 14%, 50%)',
    'bg-blue-500': 'hsl(217, 91%, 60%)',
    'bg-indigo-500': 'hsl(239, 84%, 67%)',
    'bg-violet-500': 'hsl(263, 70%, 50%)',
    'bg-purple-500': 'hsl(271, 91%, 65%)',
    'bg-fuchsia-500': 'hsl(292, 84%, 61%)',
    'bg-amber-500': 'hsl(38, 92%, 50%)',
    'bg-cyan-500': 'hsl(187, 85%, 43%)',
    'bg-green-500': 'hsl(142, 76%, 36%)',
    'bg-red-500': 'hsl(0, 84%, 60%)',
    'bg-orange-500': 'hsl(24, 95%, 53%)',
    'bg-yellow-500': 'hsl(45, 93%, 47%)',
    'bg-success': 'hsl(142, 76%, 36%)',
    'bg-destructive': 'hsl(0, 84%, 60%)',
    'bg-muted': 'hsl(215, 16%, 47%)',
  };
  return colorMap[bgColor] || 'hsl(215, 14%, 50%)';
};

export function StageProgression({ deals }: StageProgressionProps) {
  const { formatCurrencyValue } = usePreferences();
  const { stages, getStageConfig } = useDealStages();
  const dynamicStageConfig = getStageConfig();

  const stageData = useMemo(() => {
    // Get stage IDs in order
    const stageOrder = stages.map(s => s.id);
    
    // Count deals with legacy/unknown stages
    const legacyDeals = deals.filter(d => !stageOrder.includes(d.stage));
    const legacyCount = legacyDeals.length;
    const legacyValue = legacyDeals.reduce((sum, d) => sum + d.value, 0);
    
    const stageCounts = stages.map(stage => {
      const stageDeals = deals.filter(d => d.stage === stage.id);
      const count = stageDeals.length;
      const value = stageDeals.reduce((sum, d) => sum + d.value, 0);
      
      return {
        stage: stage.id,
        label: stage.label,
        shortLabel: stage.label.split(' ').slice(0, 2).join(' '),
        count,
        value,
        color: bgColorToHsl(stage.color),
      };
    });

    // Add legacy stages at the beginning if there are any
    if (legacyCount > 0) {
      stageCounts.unshift({
        stage: 'legacy',
        label: 'Legacy Stage',
        shortLabel: 'Legacy',
        count: legacyCount,
        value: legacyValue,
        color: 'hsl(0, 0%, 50%)',
      });
    }

    return stageCounts;
  }, [deals, stages]);

  const totalDeals = deals.length;
  const maxCount = Math.max(...stageData.map(d => d.count), 1);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-popover p-3 shadow-md">
          <p className="font-medium text-foreground">{data.label}</p>
          <p className="text-sm text-muted-foreground">
            {data.count} {data.count === 1 ? 'deal' : 'deals'}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatCurrencyValue(data.value)} total value
          </p>
          {totalDeals > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {((data.count / totalDeals) * 100).toFixed(1)}% of pipeline
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Pipeline Stage Progression</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stageData}
              layout="horizontal"
              margin={{ top: 10, right: 10, left: 10, bottom: 40 }}
            >
              <XAxis 
                dataKey="shortLabel" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                domain={[0, Math.ceil(maxCount * 1.1)]}
                allowDecimals={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.3)' }} />
              <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              >
                {stageData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Stage flow indicator */}
        <div className="mt-4 flex items-center justify-center gap-1 overflow-x-auto pb-2">
          {stageData.slice(0, 9).map((stage, index) => (
            <div key={stage.stage} className="flex items-center">
              <div 
                className="flex flex-col items-center min-w-[60px]"
                title={`${stage.label}: ${stage.count} deals`}
              >
                <div 
                  className="h-2 w-full rounded-full transition-all duration-300"
                  style={{ 
                    backgroundColor: stage.color,
                    opacity: stage.count > 0 ? 1 : 0.3,
                  }}
                />
                <span className="text-[10px] text-muted-foreground mt-1 text-center leading-tight">
                  {stage.count}
                </span>
              </div>
              {index < 8 && (
                <div className="mx-0.5 text-muted-foreground/50">→</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
