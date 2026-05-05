import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

import { Loader2, Users, DollarSign, FileCheck, Building2, UserCheck } from 'lucide-react';
import {
  type QuarterOption,
} from '@/hooks/useQBQuarterlyRevenue';
import { usePipelineStageMetrics, type StageEntryDeal } from '@/hooks/usePipelineStageMetrics';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

/** Combined-widget formatter: shows millions as "MM" per requested format. */
const formatCurrencyMM = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}MM`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

interface MetricCardConfig {
  id: string;
  title: string;
  icon: typeof Users;
  value: string | number;
  isLoading: boolean;
  deals: StageEntryDeal[];
  color: string;
  drilldownTitle: string;
}

export function MetricKPICard({
  config,
  onClick,
}: {
  config: MetricCardConfig;
  onClick: () => void;
}) {
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
      {/* Top gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${config.color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/20"
          style={{
            background: `linear-gradient(135deg, ${config.color}20, transparent)`,
          }}
        >
          <Icon className="h-5 w-5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate">{config.title}</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {config.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={onClick}
                className="drilldown-value text-xl font-bold font-mono tabular-nums text-foreground"
              >
                {config.value}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PipelineDrilldownModal({
  open,
  onClose,
  title,
  deals,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  deals: StageEntryDeal[];
}) {
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
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
          <span className="text-xs text-muted-foreground">Filtered by selected period</span>
        </div>

        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No deals found for this period.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Deal / Company</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Current Stage</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Entered</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{deal.company}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">
                      {formatCurrencyFull(deal.value)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {deal.current_stage?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(deal.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{deal.manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20">
                  <td className="px-3 py-2 text-xs font-medium">Total</td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">
                    {formatCurrencyFull(total)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type PipelineMetricCardId =
  | 'deals-on-board'
  | 'debt-dollar-on-board'
  | 'debt-deals-signed'
  | 'debt-dollar-signed'
  | 'finserv-deals-on-board'
  | 'finserv-clients-signed';

export const PIPELINE_METRIC_LABELS: Record<PipelineMetricCardId, string> = {
  'deals-on-board': 'Deals on the Board',
  'debt-dollar-on-board': 'Debt $ on the Board',
  'debt-deals-signed': 'Debt Deals Signed',
  'debt-dollar-signed': 'Debt $ Signed',
  'finserv-deals-on-board': 'FinServ: Deals on the Board',
  'finserv-clients-signed': 'FinServ Clients Signed',
};

/** Single Pipeline Metric KPI tile, self-contained so it can be placed
 *  individually in the unified Weekly Rundown grid. */
export function PipelineMetricWidget({
  cardId,
  selectedQuarter,
}: {
  cardId: PipelineMetricCardId;
  selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption;
}) {
  const metrics = usePipelineStageMetrics(selectedQuarter);
  const [drilldown, setDrilldown] = useState<{ title: string; deals: StageEntryDeal[] } | null>(null);

  const map: Record<PipelineMetricCardId, MetricCardConfig> = {
    'deals-on-board': {
      id: 'deals-on-board', title: PIPELINE_METRIC_LABELS['deals-on-board'], icon: Users,
      value: metrics.dealsOnBoard.count, isLoading: metrics.dealsOnBoard.isLoading,
      deals: metrics.dealsOnBoard.deals, color: 'hsl(var(--primary))',
      drilldownTitle: 'Deals on the Board — Active Pipeline',
    },
    'debt-dollar-on-board': {
      id: 'debt-dollar-on-board', title: PIPELINE_METRIC_LABELS['debt-dollar-on-board'], icon: DollarSign,
      value: formatCurrency(metrics.debtDollarOnBoard.dollarVolume),
      isLoading: metrics.debtDollarOnBoard.isLoading,
      deals: metrics.debtDollarOnBoard.deals, color: 'hsl(var(--chart-2))',
      drilldownTitle: 'Debt $ on the Board — Active Pipeline',
    },
    'debt-deals-signed': {
      id: 'debt-deals-signed', title: PIPELINE_METRIC_LABELS['debt-deals-signed'], icon: FileCheck,
      value: metrics.debtDealsSigned.count, isLoading: metrics.debtDealsSigned.isLoading,
      deals: metrics.debtDealsSigned.deals, color: 'hsl(var(--chart-3))',
      drilldownTitle: 'Debt Deals Signed — Final Credit Items',
    },
    'debt-dollar-signed': {
      id: 'debt-dollar-signed', title: PIPELINE_METRIC_LABELS['debt-dollar-signed'], icon: DollarSign,
      value: formatCurrency(metrics.debtDollarSigned.dollarVolume),
      isLoading: metrics.debtDollarSigned.isLoading,
      deals: metrics.debtDollarSigned.deals, color: 'hsl(var(--chart-4))',
      drilldownTitle: 'Debt $ Signed — Final Credit Items',
    },
    'finserv-deals-on-board': {
      id: 'finserv-deals-on-board', title: PIPELINE_METRIC_LABELS['finserv-deals-on-board'], icon: Building2,
      value: metrics.finservDealsOnBoard.count, isLoading: metrics.finservDealsOnBoard.isLoading,
      deals: metrics.finservDealsOnBoard.deals, color: 'hsl(var(--chart-5))',
      drilldownTitle: 'FinServ: Deals on the Board — Added to Pipeline',
    },
    'finserv-clients-signed': {
      id: 'finserv-clients-signed', title: PIPELINE_METRIC_LABELS['finserv-clients-signed'], icon: UserCheck,
      value: metrics.finservClientsSigned.count, isLoading: metrics.finservClientsSigned.isLoading,
      deals: metrics.finservClientsSigned.deals, color: 'hsl(var(--success))',
      drilldownTitle: 'FinServ Clients Signed — Active Client',
    },
  };
  const card = map[cardId];
  return (
    <div className="h-full">
      <MetricKPICard config={card} onClick={() => setDrilldown({ title: card.drilldownTitle, deals: card.deals })} />
      <PipelineDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combined Pipeline Metric tile — shows deal count AND dollar volume side-by-side.
// ---------------------------------------------------------------------------
export type CombinedPipelineMetricId = 'debt-on-board-combined' | 'debt-signed-combined' | 'debt-closed-combined';

export const COMBINED_PIPELINE_METRIC_LABELS: Record<CombinedPipelineMetricId, string> = {
  'debt-on-board-combined': 'Deals on the Board',
  'debt-signed-combined': 'Deals Signed',
  'debt-closed-combined': 'Deals Closed',
};

export function CombinedPipelineMetricWidget({
  cardId,
  selectedQuarter,
}: {
  cardId: CombinedPipelineMetricId;
  selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption;
}) {
  const metrics = usePipelineStageMetrics(selectedQuarter);
  const [drilldown, setDrilldown] = useState<{ title: string; deals: StageEntryDeal[] } | null>(null);

  const config = (() => {
    if (cardId === 'debt-on-board-combined') {
      return {
        title: 'Deals on the Board',
        icon: Users,
        color: 'hsl(var(--primary))',
        count: metrics.dealsOnBoard.count,
        dollars: metrics.debtDollarOnBoard.dollarVolume,
        isLoading: metrics.dealsOnBoard.isLoading || metrics.debtDollarOnBoard.isLoading,
        deals: metrics.debtDollarOnBoard.deals,
        drilldownTitle: 'Deals on the Board — Active Pipeline',
      };
    }
    if (cardId === 'debt-signed-combined') {
      return {
        title: 'Deals Signed',
        icon: FileCheck,
        color: 'hsl(var(--chart-3))',
        count: metrics.debtDealsSigned.count,
        dollars: metrics.debtDollarSigned.dollarVolume,
        isLoading: metrics.debtDealsSigned.isLoading || metrics.debtDollarSigned.isLoading,
        deals: metrics.debtDealsSigned.deals,
        drilldownTitle: 'Debt Deals Signed — Final Credit Items',
      };
    }
    return {
      title: 'Deals Closed',
      icon: FileCheck,
      color: 'hsl(var(--chart-4))',
      count: metrics.debtDealsClosed.count,
      dollars: metrics.debtDollarClosed.dollarVolume,
      isLoading: metrics.debtDealsClosed.isLoading || metrics.debtDollarClosed.isLoading,
      deals: metrics.debtDealsClosed.deals,
      drilldownTitle: 'Deals Closed — Funded / Invoiced',
    };
    // (legacy fallthrough removed above)
    // eslint-disable-next-line no-unreachable
    return {
      title: 'Deals Signed',
      icon: FileCheck,
      color: 'hsl(var(--chart-3))',
      count: metrics.debtDealsSigned.count,
      dollars: metrics.debtDollarSigned.dollarVolume,
      isLoading: metrics.debtDealsSigned.isLoading || metrics.debtDollarSigned.isLoading,
      deals: metrics.debtDealsSigned.deals,
      drilldownTitle: 'Debt Deals Signed — Final Credit Items',
    };
  })();

  const Icon = config.icon;

  return (
    <div className="h-full">
      <Card
        onClick={() => setDrilldown({ title: config.drilldownTitle, deals: config.deals })}
        className={cn(
          'relative group cursor-pointer overflow-hidden transition-all duration-200 h-full',
          'glass-module',
          'hover:border-primary/40 hover:-translate-y-0.5',
          'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
        )}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
          style={{ background: `linear-gradient(90deg, ${config.color}, transparent)` }}
        />
        <CardContent className="flex items-center gap-4 p-4 h-full">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/20"
            style={{ background: `linear-gradient(135deg, ${config.color}20, transparent)` }}
          >
            <Icon className="h-5 w-5" style={{ color: config.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate">
              {config.title}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              {config.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                    {config.count} <span className="text-xs font-medium text-muted-foreground">Deal{config.count === 1 ? '' : 's'}</span>
                  </span>
                  <span className="text-muted-foreground/60 font-light">|</span>
                  <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                    {formatCurrencyMM(config.dollars)}
                  </span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <PipelineDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
      />
    </div>
  );
}

export function PipelineMetricsSection({ selectedQuarter }: { selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption }) {
  const metrics = usePipelineStageMetrics(selectedQuarter);

  const [drilldown, setDrilldown] = useState<{ title: string; deals: StageEntryDeal[] } | null>(null);

  const cards: MetricCardConfig[] = [
    {
      id: 'deals-on-board',
      title: 'Deals on the Board',
      icon: Users,
      value: metrics.dealsOnBoard.count,
      isLoading: metrics.dealsOnBoard.isLoading,
      deals: metrics.dealsOnBoard.deals,
      color: 'hsl(var(--primary))',
      drilldownTitle: 'Deals on the Board — Active Pipeline',
    },
    {
      id: 'debt-dollar-on-board',
      title: 'Debt $ on the Board',
      icon: DollarSign,
      value: formatCurrency(metrics.debtDollarOnBoard.dollarVolume),
      isLoading: metrics.debtDollarOnBoard.isLoading,
      deals: metrics.debtDollarOnBoard.deals,
      color: 'hsl(var(--chart-2))',
      drilldownTitle: 'Debt $ on the Board — Active Pipeline',
    },
    {
      id: 'debt-deals-signed',
      title: 'Debt Deals Signed',
      icon: FileCheck,
      value: metrics.debtDealsSigned.count,
      isLoading: metrics.debtDealsSigned.isLoading,
      deals: metrics.debtDealsSigned.deals,
      color: 'hsl(var(--chart-3))',
      drilldownTitle: 'Debt Deals Signed — Final Credit Items',
    },
    {
      id: 'debt-dollar-signed',
      title: 'Debt $ Signed',
      icon: DollarSign,
      value: formatCurrency(metrics.debtDollarSigned.dollarVolume),
      isLoading: metrics.debtDollarSigned.isLoading,
      deals: metrics.debtDollarSigned.deals,
      color: 'hsl(var(--chart-4))',
      drilldownTitle: 'Debt $ Signed — Final Credit Items',
    },
    {
      id: 'finserv-deals-on-board',
      title: 'FinServ: Deals on the Board',
      icon: Building2,
      value: metrics.finservDealsOnBoard.count,
      isLoading: metrics.finservDealsOnBoard.isLoading,
      deals: metrics.finservDealsOnBoard.deals,
      color: 'hsl(var(--chart-5))',
      drilldownTitle: 'FinServ: Deals on the Board — Added to Pipeline',
    },
    {
      id: 'finserv-clients-signed',
      title: 'FinServ Clients Signed',
      icon: UserCheck,
      value: metrics.finservClientsSigned.count,
      isLoading: metrics.finservClientsSigned.isLoading,
      deals: metrics.finservClientsSigned.deals,
      color: 'hsl(var(--success))',
      drilldownTitle: 'FinServ Clients Signed — Active Client',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Pipeline Metrics</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          All metrics filtered by {selectedQuarter.label} · Click for detail
        </p>
      </div>

      {/* 6 KPI cards in 3-col grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <MetricKPICard
            key={card.id}
            config={card}
            onClick={() => setDrilldown({ title: card.drilldownTitle, deals: card.deals })}
          />
        ))}
      </div>

      {/* Drilldown modal */}
      <PipelineDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
      />
    </div>
  );
}
