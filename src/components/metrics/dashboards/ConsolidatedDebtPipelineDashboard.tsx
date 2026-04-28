import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Users, DollarSign, FileCheck, FileSignature, FileText, ClipboardCheck,
  Coins, ScrollText, Handshake, Banknote,
} from 'lucide-react';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';
import {
  useConsolidatedDebtPipelineMetrics,
  type StageEntryDeal,
} from '@/hooks/usePipelineStageMetrics';
import { cn } from '@/lib/utils';

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
  icon: typeof Users;
  value: string | number;
  isLoading: boolean;
  deals: StageEntryDeal[];
  color: string;
  drilldownTitle: string;
}

function MetricKPICard({
  config,
  onClick,
}: {
  config: MetricCardConfig;
  onClick: () => void;
}) {
  const Icon = config.icon;
  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative group cursor-pointer overflow-hidden transition-all duration-200',
        'border border-border/30 bg-card/50 backdrop-blur-xl',
        'hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${config.color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/20"
          style={{ background: `linear-gradient(135deg, ${config.color}20, transparent)` }}
        >
          <Icon className="h-5 w-5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate">{config.title}</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {config.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                {config.value}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DrilldownModal({
  open, onClose, title, deals,
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
                    <td className="px-3 py-2 text-xs text-right font-mono">{formatCurrencyFull(deal.value)}</td>
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
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">{formatCurrencyFull(total)}</td>
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

interface SectionDef {
  id: string;
  title: string;
  description: string;
  cards: MetricCardConfig[];
}

export function ConsolidatedDebtPipelineDashboard({
  selectedQuarter,
}: {
  selectedQuarter?: QuarterOption;
}) {
  const m = useConsolidatedDebtPipelineMetrics(selectedQuarter as QuarterOption);
  const [drilldown, setDrilldown] = useState<{ title: string; deals: StageEntryDeal[] } | null>(null);

  if (!selectedQuarter) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a quarter from the dashboard header to view Consolidated Debt Pipeline metrics.
      </div>
    );
  }

  const sections: SectionDef[] = [
    {
      id: 'sales',
      title: 'Sales',
      description: 'New opportunities entering the pipeline',
      cards: [
        {
          id: 'deals-on-board',
          title: 'Deals on the Board',
          icon: Users,
          value: m.ndaNeedsList.count,
          isLoading: m.ndaNeedsList.isLoading,
          deals: m.ndaNeedsList.deals,
          color: 'hsl(var(--primary))',
          drilldownTitle: 'Deals on the Board — entered NDA/Needs List Sent',
        },
        {
          id: 'debt-dollar-on-board',
          title: 'Debt $ on the Board',
          icon: DollarSign,
          value: formatCurrency(m.ndaNeedsList.dollarVolume),
          isLoading: m.ndaNeedsList.isLoading,
          deals: m.ndaNeedsList.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Debt $ on the Board — entered NDA/Needs List Sent',
        },
      ],
    },
    {
      id: 'proposals',
      title: 'Proposals',
      description: 'Proposals issued to clients in the Active Pipeline',
      cards: [
        {
          id: 'proposals-issued',
          title: 'Proposals Issued',
          icon: FileText,
          value: m.proposalsIssued.count,
          isLoading: m.proposalsIssued.isLoading,
          deals: m.proposalsIssued.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Proposals Issued — entered Proposal Issued',
        },
        {
          id: 'dollars-proposed',
          title: 'Dollars Proposed',
          icon: Coins,
          value: formatCurrency(m.proposalsIssued.dollarVolume),
          isLoading: m.proposalsIssued.isLoading,
          deals: m.proposalsIssued.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Dollars Proposed — entered Proposal Issued',
        },
      ],
    },
    {
      id: 'signed',
      title: 'Signed',
      description: 'Engagements signed (entered Final Credit Items)',
      cards: [
        {
          id: 'debt-deals-signed',
          title: 'Debt Deals Signed',
          icon: FileSignature,
          value: m.finalCreditItems.count,
          isLoading: m.finalCreditItems.isLoading,
          deals: m.finalCreditItems.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Debt Deals Signed — entered Final Credit Items',
        },
        {
          id: 'debt-dollar-signed',
          title: 'Debt $ Signed',
          icon: Banknote,
          value: formatCurrency(m.finalCreditItems.dollarVolume),
          isLoading: m.finalCreditItems.isLoading,
          deals: m.finalCreditItems.deals,
          color: 'hsl(var(--success))',
          drilldownTitle: 'Debt $ Signed — entered Final Credit Items',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Terms',
      description: 'Lender terms issued and signed',
      cards: [
        {
          id: 'terms-issued',
          title: 'Terms Issued',
          icon: ScrollText,
          value: m.termsIssued.count,
          isLoading: m.termsIssued.isLoading,
          deals: m.termsIssued.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Terms Issued — entered Terms Issued',
        },
        {
          id: 'terms-issued-dollars',
          title: 'Terms Issued $',
          icon: DollarSign,
          value: formatCurrency(m.termsIssued.dollarVolume),
          isLoading: m.termsIssued.isLoading,
          deals: m.termsIssued.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Terms Issued $ — entered Terms Issued',
        },
        {
          id: 'terms-signed',
          title: 'Terms Signed',
          icon: Handshake,
          value: m.inDueDiligence.count,
          isLoading: m.inDueDiligence.isLoading,
          deals: m.inDueDiligence.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Terms Signed — entered In Due Diligence',
        },
        {
          id: 'terms-signed-dollars',
          title: 'Terms Signed $',
          icon: ClipboardCheck,
          value: formatCurrency(m.inDueDiligence.dollarVolume),
          isLoading: m.inDueDiligence.isLoading,
          deals: m.inDueDiligence.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Terms Signed $ — entered In Due Diligence',
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Consolidated Debt Pipeline</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Stage-entry metrics for the Active Pipeline · {selectedQuarter.label} · Click any tile for detail
        </p>
      </div>

      {sections.map(section => (
        <div key={section.id} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              {section.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {section.cards.map(card => (
              <MetricKPICard
                key={card.id}
                config={card}
                onClick={() => setDrilldown({ title: card.drilldownTitle, deals: card.deals })}
              />
            ))}
          </div>
        </div>
      ))}

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
      />
    </div>
  );
}
