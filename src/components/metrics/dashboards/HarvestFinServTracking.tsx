import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHarvestData } from '@/hooks/useHarvest';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { buildBuckets } from '@/lib/insightsTimeRange';
import { InsightsDrilldownDrawer } from '@/components/metrics/insights/InsightsDrilldownDrawer';

export function HarvestFinServTracking() {
  const harvest = useHarvestData();
  const { timeframe } = useInsightsTimeframe();
  const [selected, setSelected] = useState<string | null>(null);
  const buckets = buildBuckets(timeframe.start, timeframe.end, 'monthly');
  const data = buckets.map(b => ({ month: b.label, key: b.key, hours: harvest.months[b.key]?.billableHours ?? 0,
    amount: harvest.months[b.key]?.missingRates ? null : harvest.months[b.key]?.amount ?? 0 }));
  const missing = Object.values(harvest.months).some(m => m.missingRates > 0);
  return <>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {(['hours', 'amount'] as const).map(metric => <Card key={metric} className="glass-module"><CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Harvest {metric === 'hours' ? 'Billable Hours' : 'Billable Amount (USD)'}</CardTitle>
        <p className="text-xs text-muted-foreground">{timeframe.label}</p></CardHeader><CardContent>
        {harvest.isLoading ? <p>Loading Harvest…</p> : harvest.error ? <p className="text-destructive">{harvest.error.message}</p> : !harvest.status.data?.state?.active_run ? <p className="text-sm text-muted-foreground">Awaiting Harvest sync</p> : <>
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} onClick={state => { const row = state?.activePayload?.[0]?.payload; if (row?.key) setSelected(row.key); }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => [metric === 'hours' ? `${v.toFixed(2)} hrs` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, metric === 'hours' ? 'Billable hours' : 'Amount']} />
            <Bar dataKey={metric} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart></ResponsiveContainer></div>
          {metric === 'amount' && missing && <p className="text-xs text-muted-foreground">— where billable rates are missing or currency is not USD.</p>}
          <Button variant="ghost" size="sm" onClick={() => setSelected('all')}>View time entries</Button>
        </>}
      </CardContent></Card>)}
    </div>
    <InsightsDrilldownDrawer open={selected != null} onClose={() => setSelected(null)} context={{ sourceId: 'harvest', sourceLabel: 'Harvest Time Entries', selection: selected === 'all' ? timeframe.label : selected ?? undefined }}
      columns={[{ key: 'spent_date', label: 'Date' }, { key: 'user_name', label: 'Team member' }, { key: 'client_name', label: 'Client' }, { key: 'project_name', label: 'Project' }, { key: 'task_name', label: 'Task' }, { key: 'hours', label: 'Hours', align: 'right' }, { key: 'billable', label: 'Billable', render: row => row.billable ? 'Yes' : 'No' }]}
      rows={harvest.entries.filter(e => selected === 'all' || e.spent_date.startsWith(selected ?? '_'))} />
  </>;
}