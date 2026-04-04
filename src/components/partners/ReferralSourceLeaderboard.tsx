import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { Trophy, Medal, Award, BarChart3, Inbox } from 'lucide-react';
import { subMonths } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type TimePeriod = '3m' | '6m' | '12m';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  '12m': 'TTM',
};

const PERIOD_MONTHS: Record<TimePeriod, number> = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

interface LeaderEntry {
  name: string;
  count: number;
}

const DONUT_GRADIENT_PAIRS = [
  ['#3b82f6', '#06b6d4'], // blue → cyan
  ['#a855f7', '#ec4899'], // purple → pink
  ['#22c55e', '#14b8a6'], // green → teal
  ['#f59e0b', '#eab308'], // amber → yellow
  ['#ef4444', '#f97316'], // red → orange
];

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-gray-300" />;
  if (rank === 3) return <Award className="h-4 w-4 text-amber-600" />;
  return <span className="h-4 w-4 flex items-center justify-center text-xs text-muted-foreground font-medium">{rank}</span>;
}

function DonutChart({ entries, gradientPrefix }: { entries: LeaderEntry[]; gradientPrefix: string }) {
  const total = entries.reduce((s, e) => s + e.count, 0);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {entries.map((_, i) => (
                <linearGradient key={`${gradientPrefix}-${i}`} id={`${gradientPrefix}-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={DONUT_GRADIENT_PAIRS[i % 5][0]} />
                  <stop offset="100%" stopColor={DONUT_GRADIENT_PAIRS[i % 5][1]} />
                </linearGradient>
              ))}
            </defs>
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Pie
              data={entries}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              strokeWidth={0}
              paddingAngle={2}
            >
              {entries.map((_, i) => (
                <Cell key={i} fill={`url(#${gradientPrefix}-${i})`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold">{total}</span>
          <span className="text-[10px] text-muted-foreground">deals</span>
        </div>
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {entries.map((e, i) => (
          <div key={e.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: `linear-gradient(135deg, ${DONUT_GRADIENT_PAIRS[i % 5][0]}, ${DONUT_GRADIENT_PAIRS[i % 5][1]})` }}
            />
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{e.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderColumn({ title, entries, maxCount, icon, gradientPrefix }: {
  title: string; entries: LeaderEntry[]; maxCount: number; icon: React.ReactNode; gradientPrefix: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Inbox className="h-8 w-8 opacity-40" />
          <p className="text-sm">No referral data for this period.</p>
        </div>
      ) : (
        <div className="flex gap-4 items-start">
          {/* List */}
          <div className="flex-1 space-y-3 min-w-0">
            {entries.map((entry, i) => {
              const pct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
              return (
                <div key={entry.name} className="flex items-center gap-3">
                  <RankIcon rank={i + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{entry.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{entry.count} deal{entry.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${DONUT_GRADIENT_PAIRS[i % 5][0]}, ${DONUT_GRADIENT_PAIRS[i % 5][1]})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Donut */}
          <div className="hidden sm:block shrink-0">
            <DonutChart entries={entries} gradientPrefix={gradientPrefix} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ReferralSourceLeaderboard() {
  const { company } = useCompany();
  const { value: period, setValue: setPeriod } = useDashboardPreference<TimePeriod>('referral_leaderboard_period', '12m');

  const cutoff = useMemo(() => {
    return subMonths(new Date(), PERIOD_MONTHS[period]).toISOString();
  }, [period]);

  const { data: deals = [] } = useQuery({
    queryKey: ['leaderboard-deals', company?.id, cutoff],
    enabled: !!company?.id,
    queryFn: async () => {
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();
      let query = supabase
        .from('deals')
        .select('id, stage, referred_by, sourced_via, created_at, pipeline_id')
        .eq('company_id', company!.id)
        .gte('created_at', cutoff);
      if (naitivePipelineId) query = query.neq('pipeline_id', naitivePipelineId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { boardLeaders, signedLeaders } = useMemo(() => {
    const boardMap = new Map<string, number>();
    const signedMap = new Map<string, number>();

    for (const deal of deals) {
      const source = deal.referred_by || deal.sourced_via;
      if (!source) continue;

      if (deal.stage === 'ndaneeds-list-sent') {
        boardMap.set(source, (boardMap.get(source) || 0) + 1);
      }
      if (deal.stage === 'final-credit-items') {
        signedMap.set(source, (signedMap.get(source) || 0) + 1);
      }
    }

    const toSorted = (m: Map<string, number>): LeaderEntry[] => {
      const sorted = [...m.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      const top = sorted.slice(0, 5);
      const otherCount = sorted.slice(5).reduce((s, e) => s + e.count, 0);
      if (otherCount > 0) top.push({ name: 'Other', count: otherCount });
      return top;
    };

    return { boardLeaders: toSorted(boardMap), signedLeaders: toSorted(signedMap) };
  }, [deals]);

  const boardMax = boardLeaders[0]?.count || 0;
  const signedMax = signedLeaders[0]?.count || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Referral Source Leaderboard</h3>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(Object.entries(PERIOD_LABELS) as [TimePeriod, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                period === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderColumn
          title="Top Sources for Deals on Board"
          entries={boardLeaders}
          maxCount={boardMax}
          icon={<Trophy className="h-4 w-4 text-yellow-400" />}
          gradientPrefix="board"
        />
        <LeaderColumn
          title="Top Sources for Signed Clients"
          entries={signedLeaders}
          maxCount={signedMax}
          icon={<Medal className="h-4 w-4 text-primary" />}
          gradientPrefix="signed"
        />
      </div>
    </div>
  );
}
