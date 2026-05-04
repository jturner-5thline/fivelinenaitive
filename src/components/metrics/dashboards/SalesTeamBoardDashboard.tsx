import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Users, DollarSign, Building2, UserCheck, FileSignature, FileText, Sparkles,
} from 'lucide-react';
import {
  buildQuarterOptions,
  getCurrentQuarter,
  type QuarterOption,
} from '@/hooks/useQBQuarterlyRevenue';
import { useSalesTeamBoardMetrics } from '@/hooks/useSalesTeamBoardMetrics';
import type { StageEntryDeal } from '@/hooks/usePipelineStageMetrics';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { GlassCard, GlassCardHeader, GlassCardBody } from '@/components/metrics/GlassCard';

// Liquid Glass chart primitives (mirrors Executive Dashboard styling).
const AXIS_TICK = { fontSize: 10, fill: 'rgba(180, 210, 245, 0.55)' } as const;
const AXIS_LINE = { stroke: 'rgba(160, 200, 255, 0.12)' } as const;
const GRID_STROKE = 'rgba(160, 200, 255, 0.10)';
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover) / 0.96)',
  border: '1px solid hsl(0 0% 100% / 0.14)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(0 0% 100%)',
  boxShadow: 'var(--shadow-xl)',
  backdropFilter: 'blur(16px)',
};
const LEGEND_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(180, 210, 245, 0.7)',
  paddingTop: 4,
};

// Team Performance — relocated from Executive Dashboard. Mock data
// preserved as-is; live wiring is a separate follow-up.
const TEAM_PERFORMANCE_DATA = [
  { name: 'James', closed: 5, value: 12000000 },
  { name: 'Flor', closed: 3, value: 8000000 },
  { name: 'Niki', closed: 4, value: 9500000 },
  { name: 'Paz', closed: 2, value: 4500000 },
  { name: 'Chandler', closed: 1, value: 3000000 },
];

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

interface MetricCardConfig {
  id: string;
  title: string;
  subtitle?: string;
  icon: typeof Users;
  value: string | number;
  isLoading: boolean;
  deals: StageEntryDeal[];
  color: string;
  drilldownTitle: string;
}

function MetricKPICard({ config, onClick }: { config: MetricCardConfig; onClick: () => void }) {
  const Icon = config.icon;
  return (
    <Card
      className={cn(
        'relative group overflow-hidden transition-all duration-200',
        'glass-module',
        'hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${config.color}, transparent)` }}
      />
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/20"
          style={{ background: `linear-gradient(135deg, ${config.color}20, transparent)` }}
        >
          <Icon className="h-5 w-5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium leading-tight">{config.title}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            {config.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={onClick}
                className="text-xl font-bold font-mono tabular-nums text-foreground cursor-pointer hover:text-primary transition-colors"
              >
                {config.value}
              </button>
            )}
          </div>
          {config.subtitle && (
            <p className="text-[10px] text-muted-foreground/80 mt-1 leading-tight">{config.subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DrilldownModal({
  open, onClose, title, deals,
}: { open: boolean; onClose: () => void; title: string; deals: StageEntryDeal[] }) {
  const total = deals.reduce((s, d) => s + d.value, 0);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="text-xs">
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono">
            {formatCurrencyFull(total)}
          </Badge>
        </div>
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No deals found for this period.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Company</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Entered</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{deal.company}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{formatCurrencyFull(deal.value)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(deal.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{deal.manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SalesTeamBoardDashboard() {
  const quarterOptions = useMemo(() => buildQuarterOptions(8), []);
  const [quarterValue, setQuarterValue] = useState(() => getCurrentQuarter().value);
  const selectedQuarter: QuarterOption = useMemo(
    () => quarterOptions.find(q => q.value === quarterValue) ?? quarterOptions[0],
    [quarterOptions, quarterValue],
  );

  const m = useSalesTeamBoardMetrics(selectedQuarter);
  const [drilldown, setDrilldown] = useState<{ title: string; deals: StageEntryDeal[] } | null>(null);

  const cards: MetricCardConfig[] = [
    {
      id: 'ioi-count',
      title: 'Indication of Interest Count',
      subtitle: 'Entered "Indication of Interest" · In Development',
      icon: Sparkles,
      value: m.inDevIndication.count,
      isLoading: m.inDevIndication.isLoading,
      deals: m.inDevIndication.deals,
      color: 'hsl(var(--primary))',
      drilldownTitle: 'Indication of Interest — In Development',
    },
    {
      id: 'ioi-dollars',
      title: 'Indication of Interest $',
      subtitle: 'Sum of deal value · In Development',
      icon: DollarSign,
      value: formatCurrency(m.inDevIndication.dollarVolume),
      isLoading: m.inDevIndication.isLoading,
      deals: m.inDevIndication.deals,
      color: 'hsl(var(--chart-2))',
      drilldownTitle: 'Indication of Interest $ — In Development',
    },
    {
      id: 'fs-on-board',
      title: 'FinServ: Deals on the Board',
      subtitle: 'Added to FinServ Pipeline',
      icon: Building2,
      value: m.finservOnBoard.count,
      isLoading: m.finservOnBoard.isLoading,
      deals: m.finservOnBoard.deals,
      color: 'hsl(var(--chart-5))',
      drilldownTitle: 'FinServ: Deals on the Board',
    },
    {
      id: 'fs-dollar-on-board',
      title: 'FinServ: $ on the Board',
      subtitle: 'Sum of deal value added to pipeline',
      icon: DollarSign,
      value: formatCurrency(m.finservOnBoard.dollarVolume),
      isLoading: m.finservOnBoard.isLoading,
      deals: m.finservOnBoard.deals,
      color: 'hsl(var(--chart-4))',
      drilldownTitle: 'FinServ: $ on the Board',
    },
    {
      id: 'fs-clients-signed',
      title: 'FinServ Clients Signed',
      subtitle: 'Entered "Active Client"',
      icon: UserCheck,
      value: m.finservSigned.count,
      isLoading: m.finservSigned.isLoading,
      deals: m.finservSigned.deals,
      color: 'hsl(var(--success))',
      drilldownTitle: 'FinServ Clients Signed — Active Client',
    },
    {
      id: 'fs-dollars-signed',
      title: 'FinServ Dollars Signed',
      subtitle: 'Sum of value of new Active Clients',
      icon: DollarSign,
      value: formatCurrency(m.finservSigned.dollarVolume),
      isLoading: m.finservSigned.isLoading,
      deals: m.finservSigned.deals,
      color: 'hsl(var(--success))',
      drilldownTitle: 'FinServ Dollars Signed — Active Client',
    },
    {
      id: 'fs-proposals',
      title: 'FinServ Proposals Issued',
      subtitle: 'Entered "Proposal Issued"',
      icon: FileSignature,
      value: m.finservProposalsIssued.count,
      isLoading: m.finservProposalsIssued.isLoading,
      deals: m.finservProposalsIssued.deals,
      color: 'hsl(var(--chart-3))',
      drilldownTitle: 'FinServ Proposals Issued',
    },
    {
      id: 'fs-proposals-dollars',
      title: 'FinServ Proposals Issued $',
      subtitle: 'Sum of value at proposal issuance',
      icon: FileText,
      value: formatCurrency(m.finservProposalsIssued.dollarVolume),
      isLoading: m.finservProposalsIssued.isLoading,
      deals: m.finservProposalsIssued.deals,
      color: 'hsl(var(--chart-3))',
      drilldownTitle: 'FinServ Proposals Issued $',
    },
    {
      id: 'fs-avg-deal-size',
      title: 'FinServ Avg. Deal Size Added to Board',
      subtitle: 'Avg value of deals added (excludes $0)',
      icon: Users,
      value: formatCurrency(m.finservAvgDealSizeOnBoard.value),
      isLoading: m.finservAvgDealSizeOnBoard.isLoading,
      deals: m.finservAvgDealSizeOnBoard.deals,
      color: 'hsl(var(--chart-1))',
      drilldownTitle: 'FinServ Deals Added to Board (avg basis)',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header with period selector */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sales Team Board</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            All metrics filtered by {selectedQuarter.label} · Click for detail
          </p>
        </div>
        <Select value={quarterValue} onValueChange={setQuarterValue}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {quarterOptions.map(q => (
              <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3">
        {cards.map(card => (
          <MetricKPICard
            key={card.id}
            config={card}
            onClick={() => setDrilldown({ title: card.drilldownTitle, deals: card.deals })}
          />
        ))}
      </div>

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
      />

      {/* Team Performance */}
      <GlassCard interactive>
        <GlassCardHeader title="Team Performance" subtitle="Quarter to date" />
        <GlassCardBody>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={TEAM_PERFORMANCE_DATA} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'Deal Value' ? formatCurrency(value) : value,
                    name,
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(160,200,255,0.06)' }}
                />
                <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
                <Bar yAxisId="left" dataKey="closed" fill="hsl(var(--primary))" name="Deals Closed" shape={createGlassBarShape({ radius: 4 })} />
                <Bar yAxisId="right" dataKey="value" fill="hsl(var(--chart-2))" name="Deal Value" shape={createGlassBarShape({ radius: 4 })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCardBody>
      </GlassCard>
    </div>
  );
}
