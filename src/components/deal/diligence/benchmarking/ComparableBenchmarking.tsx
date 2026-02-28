import { useState, useEffect, useMemo } from 'react';
import { BarChart3, TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { FinancialMetric } from '../types';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Cell
} from 'recharts';

interface DealBenchmark {
  id: string;
  company: string;
  value: number | null;
  stage: string | null;
}

interface ComparableBenchmarkingProps {
  dealId: string;
  dealName?: string;
  dealValue?: number;
  metrics: FinancialMetric[];
  className?: string;
}

export function ComparableBenchmarking({ dealId, dealName, dealValue, metrics, className }: ComparableBenchmarkingProps) {
  const [pipelineDeals, setPipelineDeals] = useState<DealBenchmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDeals() {
      setIsLoading(true);
      const { data } = await supabase
        .from('deals')
        .select('id, company, value, stage')
        .neq('id', dealId)
        .not('value', 'is', null)
        .order('value', { ascending: false })
        .limit(20);
      setPipelineDeals((data || []) as DealBenchmark[]);
      setIsLoading(false);
    }
    fetchDeals();
  }, [dealId]);

  const benchmarkData = useMemo(() => {
    if (!dealValue || pipelineDeals.length === 0) return null;

    const values = pipelineDeals
      .filter(d => d.value != null)
      .map(d => d.value!)
      .sort((a, b) => a - b);

    if (values.length === 0) return null;

    const median = values[Math.floor(values.length / 2)];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = values[0];
    const max = values[values.length - 1];

    // Calculate percentile of current deal
    const rank = values.filter(v => v <= dealValue).length;
    const percentile = Math.round((rank / values.length) * 100);

    return { median, avg, min, max, percentile, totalDeals: values.length };
  }, [pipelineDeals, dealValue]);

  const chartData = useMemo(() => {
    const deals = pipelineDeals
      .filter(d => d.value != null)
      .map(d => ({
        name: d.company.length > 12 ? d.company.slice(0, 12) + '…' : d.company,
        value: d.value! / 1e6,
        isCurrent: false,
      }));

    if (dealValue) {
      deals.push({
        name: (dealName || 'This Deal').length > 12 ? (dealName || 'This Deal').slice(0, 12) + '…' : (dealName || 'This Deal'),
        value: dealValue / 1e6,
        isCurrent: true,
      });
    }

    return deals.sort((a, b) => b.value - a.value).slice(0, 10);
  }, [pipelineDeals, dealValue, dealName]);

  const metricComparisons = useMemo(() => {
    // Compare key metrics against typical benchmarks
    const comparisons: { label: string; value: string; benchmark: string; status: 'above' | 'below' | 'inline' }[] = [];

    for (const m of metrics) {
      if (m.value == null) continue;
      if (m.key === 'gross_margin_pct' || m.key === 'grossMargin') {
        comparisons.push({
          label: 'Gross Margin',
          value: m.formatted,
          benchmark: '40-60%',
          status: m.value > 50 ? 'above' : m.value < 35 ? 'below' : 'inline',
        });
      }
      if (m.key === 'ebitda_margin_pct' || m.key === 'ebitdaMargin') {
        comparisons.push({
          label: 'EBITDA Margin',
          value: m.formatted,
          benchmark: '15-25%',
          status: m.value > 25 ? 'above' : m.value < 12 ? 'below' : 'inline',
        });
      }
      if (m.key === 'leverage' || m.key === 'total_leverage') {
        comparisons.push({
          label: 'Total Leverage',
          value: m.formatted,
          benchmark: '< 4.0x',
          status: m.value < 3 ? 'above' : m.value > 5 ? 'below' : 'inline',
        });
      }
      if (m.key === 'revenue_growth' || m.key === 'revenueGrowth') {
        comparisons.push({
          label: 'Revenue Growth',
          value: m.formatted,
          benchmark: '5-15%',
          status: m.value > 15 ? 'above' : m.value < 3 ? 'below' : 'inline',
        });
      }
    }

    return comparisons;
  }, [metrics]);

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border/30 p-4", className)}>
        <p className="text-xs text-muted-foreground text-center py-8">Loading comparables…</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border/30", className)}>
      <div className="p-4 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Deal Benchmarking</h3>
          <Badge variant="outline" className="text-[10px]">
            {pipelineDeals.length} comps
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Deal Size Percentile */}
        {benchmarkData && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deal Size Positioning</p>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-lg font-bold">{benchmarkData.percentile}th</p>
                <p className="text-[10px] text-muted-foreground">Percentile</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">${(benchmarkData.median / 1e6).toFixed(1)}M</p>
                <p className="text-[10px] text-muted-foreground">Median</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">${(benchmarkData.avg / 1e6).toFixed(1)}M</p>
                <p className="text-[10px] text-muted-foreground">Average</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">{benchmarkData.totalDeals}</p>
                <p className="text-[10px] text-muted-foreground">Deals</p>
              </div>
            </div>
          </div>
        )}

        {/* Comp Chart */}
        {chartData.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deal Value Comparison ($M)</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={90} />
                  <ReTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => `$${v.toFixed(1)}M`}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/0.3)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Metric Benchmarks */}
        {metricComparisons.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Metric vs. Benchmark</p>
            <div className="space-y-2">
              {metricComparisons.map((comp, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/20">
                  <span className="text-xs font-medium">{comp.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Benchmark: {comp.benchmark}</span>
                    <div className="flex items-center gap-1">
                      {comp.status === 'above' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                      {comp.status === 'below' && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                      {comp.status === 'inline' && <Minus className="h-3 w-3 text-muted-foreground" />}
                      <span className={cn(
                        "text-xs font-semibold",
                        comp.status === 'above' ? "text-emerald-500" :
                        comp.status === 'below' ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {comp.value}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pipelineDeals.length === 0 && !benchmarkData && (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No comparable deals found in pipeline</p>
          </div>
        )}
      </div>
    </div>
  );
}
