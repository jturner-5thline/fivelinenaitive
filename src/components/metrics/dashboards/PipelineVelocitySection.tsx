import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStageTransitMetrics } from '@/hooks/useStageTransitMetrics';

/**
 * Pipeline Velocity — trailing-12-month average number of days between
 * canonical Active Pipeline stage transitions. Mirrors the visual layout of
 * the Pipeline Conversion tiles (compact KPI cards, colored accent bar) so
 * the two sections read as one unit.
 */

interface VelocityTileDef {
  id: string;
  title: string;
  color: string;
  fromVariants: string[];
  toVariants: string[];
}

// Stage-label variants match the resolver in usePipelineStageMetrics
// (case-insensitive slug + Title Case).
const V = {
  proposalIssued: ['proposal-issued', 'Proposal Issued'],
  finalCreditItems: ['final-credit-items', 'Final Credit Items'],
  lendersInReview: ['lenders-in-review', 'Lenders in Review'],
  termsIssued: ['terms-issued', 'Terms Issued'],
  inDueDiligence: ['in-due-diligence', 'In Due Diligence'],
  fundedInvoiced: ['funded-invoiced', 'Funded/Invoiced', 'Funded / Invoiced', 'Closed & Funded'],
};

const TILES: VelocityTileDef[] = [
  {
    id: 'proposal-to-engagement',
    title: 'Proposal to Engagement',
    color: 'hsl(var(--primary))',
    fromVariants: V.proposalIssued,
    toVariants: V.finalCreditItems,
  },
  {
    id: 'submission-to-terms-issued',
    title: 'Submission to Terms Issued',
    color: 'hsl(var(--chart-2))',
    fromVariants: V.lendersInReview,
    toVariants: V.termsIssued,
  },
  {
    id: 'terms-issued-to-terms-signed',
    title: 'Terms Issued to Terms Signed',
    color: 'hsl(var(--chart-3))',
    fromVariants: V.termsIssued,
    toVariants: V.inDueDiligence,
  },
  {
    id: 'terms-signed-to-funded',
    title: 'Terms Signed to Funded / Invoiced',
    color: 'hsl(var(--chart-4))',
    fromVariants: V.inDueDiligence,
    toVariants: V.fundedInvoiced,
  },
  {
    id: 'signed-to-funded',
    title: 'Signed to Funded / Invoiced',
    color: 'hsl(var(--chart-5))',
    fromVariants: V.finalCreditItems,
    toVariants: V.fundedInvoiced,
  },
];

const DAYS_PER_MONTH = 30.4375;

function VelocityTile({ tile }: { tile: VelocityTileDef }) {
  const { buckets, isLoading } = useStageTransitMetrics({
    fromVariants: tile.fromVariants,
    toVariants: tile.toVariants,
    windowMonths: 12,
    logInverted: false,
  });

  const closed = buckets.filter((b) => !b.isOpen);
  const totalDeals = closed.reduce((s, b) => s + b.dealCount, 0);
  const avgMonths = totalDeals > 0
    ? closed.reduce((s, b) => s + b.avgMonths * b.dealCount, 0) / totalDeals
    : 0;
  const avgDays = Math.round(avgMonths * DAYS_PER_MONTH);

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
        style={{ background: `linear-gradient(90deg, ${tile.color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-2 py-4 px-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate" title={tile.title}>
            {tile.title}
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                {totalDeals > 0 ? `${avgDays}d` : '—'}
              </span>
            )}
          </div>
          {!isLoading && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {totalDeals > 0 ? `n = ${totalDeals} deal${totalDeals === 1 ? '' : 's'}` : 'No completed transits'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PipelineVelocitySection() {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Pipeline Velocity
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Average days between stages · trailing 12 months (Active Pipeline)
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {TILES.map((tile) => (
          <VelocityTile key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}