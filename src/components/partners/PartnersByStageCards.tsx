import { useMemo } from 'react';
import { Settings, ChevronRight } from 'lucide-react';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface Props {
  onNavigateToStage?: (stageId: string) => void;
}

// Helper: hex string from any CSS color (used for gradients)
function stageColorToHex(color: string): string {
  // color is a tailwind class like "bg-yellow-500" — map common ones
  const map: Record<string, string> = {
    'bg-yellow-500': '#eab308', 'bg-amber-500': '#f59e0b', 'bg-pink-500': '#ec4899',
    'bg-rose-500': '#f43f5e', 'bg-green-500': '#22c55e', 'bg-emerald-500': '#10b981',
    'bg-red-500': '#ef4444', 'bg-blue-500': '#3b82f6', 'bg-indigo-500': '#6366f1',
    'bg-violet-500': '#8b5cf6', 'bg-purple-500': '#a855f7', 'bg-fuchsia-500': '#d946ef',
    'bg-cyan-500': '#06b6d4', 'bg-teal-500': '#14b8a6', 'bg-orange-500': '#f97316',
    'bg-slate-500': '#64748b', 'bg-gray-500': '#6b7280', 'bg-lime-500': '#84cc16',
    'bg-sky-500': '#0ea5e9',
  };
  if (color?.startsWith('#')) return color;
  return map[color] || '#6366f1';
}

function lighten(hex: string, pct: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * pct));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * pct));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * pct));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

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
    displayedStages.map(s => ({
      name: s.name,
      count: countByStage.get(s.id) || 0,
      color: stageColorToHex(s.color),
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

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {displayedStages.map(stage => {
          const count = countByStage.get(stage.id) || 0;
          return (
            <button
              key={stage.id}
              onClick={() => onNavigateToStage?.(stage.id)}
              className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-left hover:border-muted-foreground/40 hover:bg-muted/30 transition-all"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-xs text-muted-foreground truncate">{stage.name}</span>
              </div>
              <span className="text-2xl font-bold">{count}</span>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                View partners <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Vertical bar chart */}
      {chartData.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <defs>
                {chartData.map((d, i) => (
                  <linearGradient key={`g-${i}`} id={`stageGrad-${i}`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={d.color} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={lighten(d.color, 0.25)} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`url(#stageGrad-${i})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
