import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { Deal, DealStatus, STATUS_CONFIG } from '@/types/deal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { DollarSign, TrendingUp, Users, Activity, ArrowUpDown, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  'on-track': '#22c55e',
  'at-risk': '#f59e0b',
  'off-track': '#ef4444',
  'on-hold': '#3b82f6',
  'archived': '#f97316',
};

const STATUS_DISPLAY: Record<string, string> = {
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  'off-track': 'Off Track',
  'on-hold': 'On Hold',
  'archived': 'Archived',
};

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
};

type SortKey = 'name' | 'company' | 'value' | 'stage' | 'status' | 'lenderCount' | 'engagement';
type GroupBy = 'none' | 'status' | 'stage';

export function PortfolioRiskAnalysis() {
  const { deals } = useDealsContext();
  const { stages } = useDealStages();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  const activeDeals = useMemo(() => deals.filter(d => d.status !== 'archived'), [deals]);

  // Stage label map
  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    stages.forEach(s => { map[s.id] = s.label; });
    return map;
  }, [stages]);

  // KPIs
  const kpis = useMemo(() => {
    const totalValue = activeDeals.reduce((s, d) => s + d.value, 0);
    const totalActive = activeDeals.length;

    // Weighted avg pipeline stage
    const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
    const totalStages = stages.length || 1;
    let weightedSum = 0;
    activeDeals.forEach(d => {
      const idx = stageOrder.get(d.stage) ?? 0;
      weightedSum += (idx / (totalStages - 1 || 1)) * 100;
    });
    const avgPipelineProgress = totalActive > 0 ? weightedSum / totalActive : 0;

    // Avg lender engagement
    let totalEngagement = 0;
    let dealsWithLenders = 0;
    activeDeals.forEach(d => {
      const lenders = d.lenders || [];
      if (lenders.length > 0) {
        dealsWithLenders++;
        const activeLenders = lenders.filter(l => l.trackingStatus === 'active').length;
        totalEngagement += (activeLenders / lenders.length) * 100;
      }
    });
    const avgEngagement = dealsWithLenders > 0 ? totalEngagement / dealsWithLenders : 0;

    return { totalValue, totalActive, avgPipelineProgress, avgEngagement };
  }, [activeDeals, stages]);

  // Risk distribution data
  const riskByCount = useMemo(() => {
    const counts: Record<string, number> = {};
    activeDeals.forEach(d => {
      counts[d.status] = (counts[d.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_DISPLAY[status] || status,
      value: count,
      fill: STATUS_COLORS[status] || '#6b7280',
    }));
  }, [activeDeals]);

  const riskByDollar = useMemo(() => {
    const values: Record<string, number> = {};
    activeDeals.forEach(d => {
      values[d.status] = (values[d.status] || 0) + d.value;
    });
    return Object.entries(values).map(([status, value]) => ({
      name: STATUS_DISPLAY[status] || status,
      value,
      fill: STATUS_COLORS[status] || '#6b7280',
    }));
  }, [activeDeals]);

  // Pipeline stage breakdown
  const pipelineBreakdown = useMemo(() => {
    const stageData: Record<string, Record<string, number>> = {};
    activeDeals.forEach(d => {
      const label = stageLabels[d.stage] || d.stage;
      if (!stageData[label]) stageData[label] = { 'On Track': 0, 'At Risk': 0, 'Off Track': 0, 'On Hold': 0 };
      const statusLabel = STATUS_DISPLAY[d.status] || d.status;
      if (stageData[label][statusLabel] !== undefined) {
        stageData[label][statusLabel]++;
      }
    });
    // Maintain stage order
    const orderedStages = stages.map(s => s.label).filter(l => stageData[l]);
    const unmatched = Object.keys(stageData).filter(k => !orderedStages.includes(k));
    return [...orderedStages, ...unmatched].map(label => ({
      name: label,
      ...stageData[label],
    }));
  }, [activeDeals, stages, stageLabels]);

  // Lender engagement per deal
  const engagementData = useMemo(() => {
    return activeDeals
      .map(d => {
        const lenders = d.lenders || [];
        const total = lenders.length;
        const active = lenders.filter(l => l.trackingStatus === 'active').length;
        const engagement = total > 0 ? Math.round((active / total) * 100) : 0;
        return { name: d.company || d.name, engagement, total, active, dealId: d.id };
      })
      .filter(d => d.total > 0)
      .sort((a, b) => a.engagement - b.engagement)
      .slice(0, 20);
  }, [activeDeals]);

  // Table data
  const tableData = useMemo(() => {
    let filtered = [...activeDeals];
    if (statusFilter !== 'all') filtered = filtered.filter(d => d.status === statusFilter);
    if (stageFilter !== 'all') filtered = filtered.filter(d => d.stage === stageFilter);

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'company': cmp = a.company.localeCompare(b.company); break;
        case 'value': cmp = a.value - b.value; break;
        case 'stage': cmp = (stageLabels[a.stage] || a.stage).localeCompare(stageLabels[b.stage] || b.stage); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'lenderCount': cmp = (a.lenders?.length || 0) - (b.lenders?.length || 0); break;
        case 'engagement': {
          const engA = a.lenders?.length ? a.lenders.filter(l => l.trackingStatus === 'active').length / a.lenders.length : 0;
          const engB = b.lenders?.length ? b.lenders.filter(l => l.trackingStatus === 'active').length / b.lenders.length : 0;
          cmp = engA - engB;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [activeDeals, statusFilter, stageFilter, sortKey, sortDir, stageLabels]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        {sortKey === field ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </div>
    </TableHead>
  );

  const getEngagement = (deal: Deal) => {
    const lenders = deal.lenders || [];
    if (lenders.length === 0) return 0;
    return Math.round((lenders.filter(l => l.trackingStatus === 'active').length / lenders.length) * 100);
  };

  const statusDot = (status: DealStatus) => (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2 w-2 rounded-full", STATUS_CONFIG[status]?.dotColor)} />
      <span className="text-xs">{STATUS_CONFIG[status]?.label || status}</span>
    </div>
  );

  // Group table data
  const groupedData = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', deals: tableData }];
    if (groupBy === 'status') {
      const groups: Record<string, Deal[]> = {};
      tableData.forEach(d => {
        const key = STATUS_DISPLAY[d.status] || d.status;
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });
      return Object.entries(groups).map(([key, deals]) => ({ key, deals }));
    }
    // stage
    const groups: Record<string, Deal[]> = {};
    tableData.forEach(d => {
      const key = stageLabels[d.stage] || d.stage;
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    return Object.entries(groups).map(([key, deals]) => ({ key, deals }));
  }, [tableData, groupBy, stageLabels]);

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0];
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
        <p className="font-medium">{data.name}</p>
        <p>{data.dataKey === 'value' && typeof data.value === 'number' && data.value > 10000
          ? formatCurrency(data.value)
          : data.value}
        </p>
      </div>
    );
  };

  const uniqueStages = useMemo(() => {
    const set = new Set(activeDeals.map(d => d.stage));
    return Array.from(set);
  }, [activeDeals]);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_DISPLAY).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {uniqueStages.map(s => (
              <SelectItem key={s} value={s}>{stageLabels[s] || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Group By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="status">Group by Status</SelectItem>
            <SelectItem value="stage">Group by Stage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Portfolio Value</p>
                <p className="text-2xl font-bold">{formatCurrency(kpis.totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-[hsl(var(--chart-2))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Deals</p>
                <p className="text-2xl font-bold">{kpis.totalActive}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-chart-3/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-[hsl(var(--chart-3))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Pipeline Progress</p>
                <p className="text-2xl font-bold">{kpis.avgPipelineProgress.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-chart-4/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-[hsl(var(--chart-4))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Lender Engagement</p>
                <p className="text-2xl font-bold">{kpis.avgEngagement.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Risk by Deal Count</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RechartsPieChart>
                <Pie data={riskByCount} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {riskByCount.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Risk by Dollar Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RechartsPieChart>
                <Pie data={riskByDollar} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                  label={({ name, value }) => `${name} ${formatCurrency(value)}`} labelLine={false}>
                  {riskByDollar.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
                      <p className="font-medium">{payload[0].name}</p>
                      <p>{formatCurrency(payload[0].value)}</p>
                    </div>
                  );
                }} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Stage Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Pipeline Stage Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={pipelineBreakdown} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={140} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="On Track" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="At Risk" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Off Track" stackId="a" fill="#ef4444" />
              <Bar dataKey="On Hold" stackId="a" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Lender Engagement Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Lender Engagement by Deal</CardTitle>
        </CardHeader>
        <CardContent>
          {engagementData.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No lender data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, engagementData.length * 32)}>
              <BarChart data={engagementData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(value: number, _: string, props: any) => [
                    `${value}% (${props.payload.active}/${props.payload.total} active)`,
                    'Engagement',
                  ]} />
                <Bar dataKey="engagement" radius={[0, 4, 4, 0]}>
                  {engagementData.map((entry, i) => (
                    <Cell key={i} fill={entry.engagement < 30 ? '#ef4444' : entry.engagement < 60 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {engagementData.filter(d => d.engagement < 30).length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{engagementData.filter(d => d.engagement < 30).length} deal(s) with low lender engagement (&lt;30%)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deals Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Deal Summary</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {groupedData.map(group => (
            <div key={group.key || 'all'}>
              {group.key && (
                <div className="px-6 py-2 bg-muted/30 border-y text-sm font-medium text-muted-foreground">
                  {group.key} ({group.deals.length})
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Deal Name" field="name" />
                    <SortHeader label="Client" field="company" />
                    <SortHeader label="Deal Size" field="value" />
                    <SortHeader label="Stage" field="stage" />
                    <SortHeader label="Status" field="status" />
                    <SortHeader label="Lenders" field="lenderCount" />
                    <SortHeader label="Engagement" field="engagement" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.deals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No deals found</TableCell>
                    </TableRow>
                  ) : (
                    group.deals.map(deal => {
                      const eng = getEngagement(deal);
                      return (
                        <TableRow key={deal.id}>
                          <TableCell className="font-medium">{deal.name}</TableCell>
                          <TableCell>{deal.company}</TableCell>
                          <TableCell>{formatCurrency(deal.value)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{stageLabels[deal.stage] || deal.stage}</Badge>
                          </TableCell>
                          <TableCell>{statusDot(deal.status)}</TableCell>
                          <TableCell>{deal.lenders?.length || 0}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${eng}%`,
                                    backgroundColor: eng < 30 ? '#ef4444' : eng < 60 ? '#f59e0b' : '#22c55e',
                                  }} />
                              </div>
                              <span className="text-xs text-muted-foreground">{eng}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
