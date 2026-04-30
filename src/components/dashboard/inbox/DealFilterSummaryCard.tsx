import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, X, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import type { Deal } from '@/types/deal';
import { dealStatusBadgeMeta } from '@/hooks/useDealMatchForEmail';
import { cn } from '@/lib/utils';

interface Props {
  deal: Deal;
  /** ISO timestamp of most recent matching email in the inbox, or null. */
  lastActivityAt?: string | null;
  /** Total number of inbox emails currently filtered to this deal. */
  matchedCount: number;
  onClear: () => void;
}

/**
 * Compact deal summary card rendered above the email list when the user
 * has filtered the inbox to a single naitive deal via the chip row.
 * Shows: deal name + company, current stage, status badge, last activity
 * (newest matching email in the loaded inbox), and a quick "Open deal"
 * link plus an explicit Clear control.
 */
export function DealFilterSummaryCard({ deal, lastActivityAt, matchedCount, onClear }: Props) {
  const navigate = useNavigate();
  const status = dealStatusBadgeMeta(deal.status);
  const stageLabel = (deal.stage || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const lastActivityLabel = lastActivityAt
    ? `${formatDistanceToNow(new Date(lastActivityAt), { addSuffix: true })}`
    : 'No matching emails loaded';

  return (
    <div className="px-3 py-2 border-b border-border/40 bg-[hsl(var(--outlook-blue)/0.04)]">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 p-1.5 rounded-md bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))] shrink-0">
          <Briefcase className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground truncate">
              {deal.company || deal.name}
            </span>
            {stageLabel && (
              <Badge variant="outline" className="text-[9px] h-[16px] px-1 text-muted-foreground border-border">
                {stageLabel}
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-[9px] h-[16px] px-1', status.className)}>
              {status.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {matchedCount} email{matchedCount === 1 ? '' : 's'} · last {lastActivityLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`/deal/${deal.id}`)}
          >
            <ArrowUpRight className="h-3 w-3 mr-0.5" />
            Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <X className="h-3 w-3 mr-0.5" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}