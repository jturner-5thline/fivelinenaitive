import { useMemo } from 'react';
import { Settings, ChevronRight } from 'lucide-react';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';

interface Props {
  onNavigateToStage?: (stageId: string) => void;
}

// Chart segment colors come from the shared Insights palette so every chart
// across Channels and Sales & BD uses the same series colors.

export function PartnersByStageCards({ onNavigateToStage }: Props) {
  const { data: stages = [] } = usePipelineStages();
  const { data: partners = [] } = usePartners();
  const { value: visibleStages, setValue: setVisibleStages } = useDashboardPreference<string[]>(
    'partner_stage_cards_visible',
    []
  );

  const effectiveVisible = visibleStages.length > 0 ? visibleStages : stages.map(s => s.id);

  const countByStage = useMemo(() => {
    const map = new Map<string, number>();
    partners.forEach(p => {
      const sid = p.stage_id || '';
      map.set(sid, (map.get(sid) || 0) + 1);
    });
    return map;
  }, [partners]);

  const toggleStage = (stageId: string) => {
    const current = effectiveVisible;
    const next = current.includes(stageId)
      ? current.filter(s => s !== stageId)
      : [...current, stageId];
    setVisibleStages(next);
  };

  const displayedStages = stages.filter(s => effectiveVisible.includes(s.id));

  const chartData = useMemo(() =>
    displayedStages.map((s, idx) => ({
      name: s.name,
      count: countByStage.get(s.id) || 0,
      color: LIQUID_GLASS_SERIES[idx % LIQUID_GLASS_SERIES.length],
      id: s.id,
    })),
    [displayedStages, countByStage]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Partners by Stage</h3>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <p className="text-xs font-medium text-muted-foreground mb-2">Visible Stages</p>
            <div className="space-y-2">
              {stages.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={effectiveVisible.includes(s.id)}
                    onCheckedChange={() => toggleStage(s.id)}
                  />
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Side-by-side: cards (35%) + chart (65%) */}
      <div className="grid grid-cols-1 md:grid-cols-[35%_1fr] gap-4 items-stretch">
        {/* Metric cards in 2-col grid */}
        <div className="grid grid-cols-2 gap-2 auto-rows-fr">
          {displayedStages.map(stage => {
            const count = countByStage.get(stage.id) || 0;
            return (
              <button
                key={stage.id}
                onClick={() => onNavigateToStage?.(stage.id)}
                className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/40 hover:bg-muted/30 transition-all min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-base text-muted-foreground truncate">{stage.name}</span>
                </div>
                <span className="text-4xl font-bold">{count}</span>
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                  View <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Bar chart */}
        {chartData.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fill: '#e5e7eb', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fill: '#e5e7eb', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  <LabelList dataKey="count" position="top" fill="#e5e7eb" fontSize={12} fontWeight={600} />
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
