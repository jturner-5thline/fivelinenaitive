import { useState, useMemo, useRef, useCallback } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
  AreaChart,
  Area,
  Treemap,
} from 'recharts';
import { cn } from '@/lib/utils';
import { DollarSign, TrendingUp, Users, Activity, ArrowUpDown, ChevronDown, ChevronUp, AlertTriangle, FileDown, Clock, Shield } from 'lucide-react';
import { differenceInDays } from 'date-fns';

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

const STATUS_KEY_FROM_DISPLAY: Record<string, string> = {
  'On Track': 'on-track',
  'At Risk': 'at-risk',
  'Off Track': 'off-track',
  'On Hold': 'on-hold',
  'Archived': 'archived',
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

const CONCENTRATION_COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4'];

type SortKey = 'name' | 'company' | 'value' | 'stage' | 'status' | 'lenderCount' | 'engagement';
type GroupBy = 'none' | 'status' | 'stage';

// Generate mock monthly trend data
function generateTrendData(deals: Deal[]) {
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const totalValue = deals.reduce((s, d) => s + d.value, 0);
  const onTrackValue = deals.filter(d => d.status === 'on-track').reduce((s, d) => s + d.value, 0);
  const atRiskValue = deals.filter(d => d.status === 'at-risk').reduce((s, d) => s + d.value, 0);
  const offTrackValue = deals.filter(d => d.status === 'off-track').reduce((s, d) => s + d.value, 0);

  return months.map((month, i) => {
    const factor = 0.6 + (i * 0.07);
    return {
      month,
      'On Track': Math.round(onTrackValue * factor * (0.85 + Math.random() * 0.3)),
      'At Risk': Math.round(atRiskValue * factor * (0.7 + Math.random() * 0.6)),
      'Off Track': Math.round(offTrackValue * factor * (0.5 + Math.random() * 0.8)),
    };
  });
}

export function PortfolioRiskAnalysis() {
  const { deals } = useDealsContext();
  const { stages } = useDealStages();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // Drawer state (now Dialog)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDeals, setDrawerDeals] = useState<Deal[]>([]);

  // Pop-up states for sections
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [concentrationOpen, setConcentrationOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);

  const activeDeals = useMemo(() => deals.filter(d => d.status !== 'archived'), [deals]);

  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    stages.forEach(s => { map[s.id] = s.label; });
    return map;
  }, [stages]);

  // KPIs
  const kpis = useMemo(() => {
    const totalValue = activeDeals.reduce((s, d) => s + d.value, 0);
    const totalActive = activeDeals.length;
    const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
    const totalStages = stages.length || 1;
    let weightedSum = 0;
    activeDeals.forEach(d => {
      const idx = stageOrder.get(d.stage) ?? 0;
      weightedSum += (idx / (totalStages - 1 || 1)) * 100;
    });
    const avgPipelineProgress = totalActive > 0 ? weightedSum / totalActive : 0;
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

  // Risk distribution
  const riskByCount = useMemo(() => {
    const counts: Record<string, number> = {};
    activeDeals.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_DISPLAY[status] || status,
      value: count,
      fill: STATUS_COLORS[status] || '#6b7280',
      statusKey: status,
    }));
  }, [activeDeals]);

  const riskByDollar = useMemo(() => {
    const values: Record<string, number> = {};
    activeDeals.forEach(d => { values[d.status] = (values[d.status] || 0) + d.value; });
    return Object.entries(values).map(([status, value]) => ({
      name: STATUS_DISPLAY[status] || status,
      value,
      fill: STATUS_COLORS[status] || '#6b7280',
      statusKey: status,
    }));
  }, [activeDeals]);

  // Pipeline stage breakdown
  const pipelineBreakdown = useMemo(() => {
    const stageData: Record<string, Record<string, number>> = {};
    activeDeals.forEach(d => {
      const label = stageLabels[d.stage] || d.stage;
      if (!stageData[label]) stageData[label] = { 'On Track': 0, 'At Risk': 0, 'Off Track': 0, 'On Hold': 0 };
      const statusLabel = STATUS_DISPLAY[d.status] || d.status;
      if (stageData[label][statusLabel] !== undefined) stageData[label][statusLabel]++;
    });
    const orderedStages = stages.map(s => s.label).filter(l => stageData[l]);
    const unmatched = Object.keys(stageData).filter(k => !orderedStages.includes(k));
    return [...orderedStages, ...unmatched].map(label => ({ name: label, ...stageData[label] }));
  }, [activeDeals, stages, stageLabels]);

  // Lender engagement
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

  // Portfolio trends (mock)
  const trendData = useMemo(() => generateTrendData(activeDeals), [activeDeals]);

  // Concentration analysis
  const concentrationData = useMemo(() => {
    const buckets = [
      { name: '<$1M', min: 0, max: 1_000_000, count: 0, value: 0 },
      { name: '$1-5M', min: 1_000_000, max: 5_000_000, count: 0, value: 0 },
      { name: '$5-20M', min: 5_000_000, max: 20_000_000, count: 0, value: 0 },
      { name: '$20M+', min: 20_000_000, max: Infinity, count: 0, value: 0 },
    ];
    activeDeals.forEach(d => {
      const bucket = buckets.find(b => d.value >= b.min && d.value < b.max);
      if (bucket) { bucket.count++; bucket.value += d.value; }
    });
    return buckets.filter(b => b.count > 0).map((b, i) => ({
      name: b.name,
      value: b.value,
      count: b.count,
      fill: CONCENTRATION_COLORS[i % CONCENTRATION_COLORS.length],
    }));
  }, [activeDeals]);

  // At-Risk Watchlist
  const getEngagement = useCallback((deal: Deal) => {
    const lenders = deal.lenders || [];
    if (lenders.length === 0) return 0;
    return Math.round((lenders.filter(l => l.trackingStatus === 'active').length / lenders.length) * 100);
  }, []);

  const atRiskWatchlist = useMemo(() => {
    return activeDeals
      .filter(d => d.status === 'at-risk' || d.status === 'off-track')
      .sort((a, b) => {
        // Off-track first, then by value desc
        if (a.status !== b.status) return a.status === 'off-track' ? -1 : 1;
        return b.value - a.value;
      })
      .slice(0, 5);
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
          cmp = engA - engB; break;
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

  const statusDot = (status: DealStatus) => (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2 w-2 rounded-full", STATUS_CONFIG[status]?.dotColor)} />
      <span className="text-xs">{STATUS_CONFIG[status]?.label || status}</span>
    </div>
  );

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
    const groups: Record<string, Deal[]> = {};
    tableData.forEach(d => {
      const key = stageLabels[d.stage] || d.stage;
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    return Object.entries(groups).map(([key, deals]) => ({ key, deals }));
  }, [tableData, groupBy, stageLabels]);

  const uniqueStages = useMemo(() => {
    const set = new Set(activeDeals.map(d => d.stage));
    return Array.from(set);
  }, [activeDeals]);

  // Handlers
  const handlePieClick = (statusDisplayName: string) => {
    const statusKey = STATUS_KEY_FROM_DISPLAY[statusDisplayName] || statusDisplayName;
    const matchingDeals = activeDeals.filter(d => d.status === statusKey);
    setDrawerTitle(`${statusDisplayName} Deals`);
    setDrawerDeals(matchingDeals);
    setDrawerOpen(true);
  };

  const handleKpiClick = (filter?: string) => {
    if (filter) {
      setStatusFilter(filter);
    } else {
      setStatusFilter('all');
    }
    setStageFilter('all');
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleExportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Portfolio / Risk Analysis', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);

    // KPIs
    doc.setFontSize(12);
    doc.text(`Total Portfolio Value: ${formatCurrency(kpis.totalValue)}`, 14, 38);
    doc.text(`Active Deals: ${kpis.totalActive}`, 14, 45);
    doc.text(`Avg Pipeline Progress: ${kpis.avgPipelineProgress.toFixed(0)}%`, 14, 52);
    doc.text(`Avg Funding Source Engagement: ${kpis.avgEngagement.toFixed(0)}%`, 14, 59);

    // Deals table
    const tableRows = activeDeals.map(d => [
      d.name,
      d.company,
      formatCurrency(d.value),
      stageLabels[d.stage] || d.stage,
      STATUS_DISPLAY[d.status] || d.status,
      String(d.lenders?.length || 0),
      `${getEngagement(d)}%`,
    ]);

    autoTable(doc, {
      startY: 68,
      head: [['Deal', 'Client', 'Size', 'Stage', 'Status', 'Lenders', 'Engagement']],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [107, 33, 168] },
    });

    doc.save('portfolio-risk-analysis.pdf');
  };

  const EngagementBar = ({ value }: { value: number }) => (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{
            width: `${value}%`,
            backgroundColor: value < 30 ? '#ef4444' : value < 60 ? '#f59e0b' : '#22c55e',
          }} />
      </div>
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  );

  // Custom treemap content
  const TreemapContent = (props: any) => {
    const { x, y, width, height, name, value, count, fill } = props;
    if (width < 40 || height < 30) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={6}
          fill={fill} fillOpacity={0.85} stroke="hsl(var(--border))" strokeWidth={1} className="cursor-pointer" />
        {width > 60 && height > 40 && (
          <>
            <text x={x + width / 2} y={y + height / 2 - 8} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={600}>{name}</text>
            <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={10}>{count} deals · {formatCurrency(value)}</text>
          </>
        )}
      </g>
    );
  };

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
        <div className="ml-auto">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards — clickable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => handleKpiClick()}>
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
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => handleKpiClick()}>
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
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => handleKpiClick()}>
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
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => handleKpiClick()}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-chart-4/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-[hsl(var(--chart-4))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Funding Source Engagement</p>
                <p className="text-2xl font-bold">{kpis.avgEngagement.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution — clickable pie segments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Risk by Deal Count</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RechartsPieChart>
                <Pie data={riskByCount} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}
                  onClick={(data) => handlePieClick(data.name)}
                  className="cursor-pointer">
                  {riskByCount.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
                      <p className="font-medium">{payload[0].name}</p>
                      <p>{payload[0].value} deals</p>
                      <p className="text-muted-foreground mt-1">Click to view</p>
                    </div>
                  );
                }} />
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
                  label={({ name, value }) => `${name} ${formatCurrency(value)}`} labelLine={false}
                  onClick={(data) => handlePieClick(data.name)}
                  className="cursor-pointer">
                  {riskByDollar.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
                      <p className="font-medium">{payload[0].name}</p>
                      <p>{formatCurrency(payload[0].value)}</p>
                      <p className="text-muted-foreground mt-1">Click to view</p>
                    </div>
                  );
                }} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Section trigger cards — open pop-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setTrendsOpen(true)}>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-chart-1/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Portfolio Trends</p>
              <p className="text-xs text-muted-foreground">Monthly value by risk status</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setConcentrationOpen(true)}>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-[hsl(var(--chart-2))]" />
            </div>
            <div>
              <p className="text-sm font-medium">Concentration Analysis</p>
              <p className="text-xs text-muted-foreground">Portfolio by deal size bucket</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setWatchlistOpen(true)}>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium">At-Risk Watchlist</p>
              <p className="text-xs text-muted-foreground">{atRiskWatchlist.length} deal{atRiskWatchlist.length !== 1 ? 's' : ''} flagged</p>
            </div>
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

      {/* Funding Source Engagement Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Funding Source Engagement by Deal</CardTitle>
        </CardHeader>
        <CardContent>
          {engagementData.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No lender data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, engagementData.length * 32)}>
              <BarChart data={engagementData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(value: number, _: string, props: any) => [`${value}% (${props.payload.active}/${props.payload.total} active)`, 'Engagement']} />
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
      <div ref={tableRef}>
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
                            <TableCell><EngagementBar value={eng} /></TableCell>
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

      {/* Drill-down Dialog (pie chart clicks) */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drawerTitle}</DialogTitle>
            <DialogDescription>{drawerDeals.length} deal{drawerDeals.length !== 1 ? 's' : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {drawerDeals.map(deal => {
              const eng = getEngagement(deal);
              return (
                <Card key={deal.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{deal.company || deal.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{deal.name}</p>
                    </div>
                    <span className="text-sm font-semibold ml-3 whitespace-nowrap">{formatCurrency(deal.value)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{stageLabels[deal.stage] || deal.stage}</Badge>
                    {statusDot(deal.status)}
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{deal.lenders?.length || 0}</span>
                    </div>
                    <EngagementBar value={eng} />
                  </div>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Portfolio Trends Pop-up */}
      <Dialog open={trendsOpen} onOpenChange={setTrendsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Portfolio Trends</DialogTitle>
            <DialogDescription>Monthly portfolio value stacked by risk status</DialogDescription>
          </DialogHeader>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={trendData} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Area type="monotone" dataKey="On Track" stackId="1" fill="#22c55e" fillOpacity={0.5} stroke="#22c55e" strokeWidth={1} />
              <Area type="monotone" dataKey="At Risk" stackId="1" fill="#f59e0b" fillOpacity={0.5} stroke="#f59e0b" strokeWidth={1} />
              <Area type="monotone" dataKey="Off Track" stackId="1" fill="#ef4444" fillOpacity={0.5} stroke="#ef4444" strokeWidth={1} />
            </AreaChart>
          </ResponsiveContainer>
        </DialogContent>
      </Dialog>

      {/* Concentration Analysis Pop-up */}
      <Dialog open={concentrationOpen} onOpenChange={setConcentrationOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Concentration Analysis</DialogTitle>
            <DialogDescription>Portfolio breakdown by deal size bucket</DialogDescription>
          </DialogHeader>
          {concentrationData.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No deals</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <Treemap data={concentrationData} dataKey="value" nameKey="name" content={<TreemapContent />}>
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string, props: any) => [
                  `${formatCurrency(value)} (${props.payload.count} deals)`, name
                ]} />
              </Treemap>
            </ResponsiveContainer>
          )}
        </DialogContent>
      </Dialog>

      {/* At-Risk Watchlist Pop-up */}
      <Dialog open={watchlistOpen} onOpenChange={setWatchlistOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-destructive" />
              <DialogTitle>At-Risk Watchlist</DialogTitle>
            </div>
            <DialogDescription>{atRiskWatchlist.length} deal{atRiskWatchlist.length !== 1 ? 's' : ''} flagged</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {atRiskWatchlist.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No at-risk deals 🎉</p>
            ) : (
              atRiskWatchlist.map(deal => {
                const eng = getEngagement(deal);
                const daysInStage = differenceInDays(new Date(), new Date(deal.updatedAt));
                return (
                  <Card key={deal.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{deal.company || deal.name}</span>
                          {statusDot(deal.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(deal.value)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {stageLabels[deal.stage] || deal.stage}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {daysInStage}d in stage
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <EngagementBar value={eng} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
