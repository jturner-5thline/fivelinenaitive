import { Link } from 'react-router-dom';
import { Deal } from '@/types/deal';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

const ICP_COLORS: Record<string, string> = {
  'Debt Advisory': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'M&A': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Equity': 'bg-green-500/15 text-green-300 border-green-500/30',
  'Placement Agent': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'Broker': 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  'Other': 'bg-muted text-muted-foreground border-border',
};

const OWNER_COLORS: Record<string, string> = {
  Paz: 'bg-rose-500 text-white',
  Flor: 'bg-sky-500 text-white',
  James: 'bg-emerald-500 text-white',
};

function initials(name?: string) {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  try { return typeof value === 'string' ? parseISO(value) : new Date(value); } catch { return null; }
}

interface Props {
  deal: Deal;
  children?: React.ReactNode;
}

export function NaitiveDealCard({ deal, children }: Props) {
  const lastActivity = safeDate(deal.updatedAt) || safeDate(deal.createdAt);
  const nextDate = safeDate(deal.nextStepDate);
  const icp = deal.icpCategory;
  const owner = deal.ownedBy || deal.manager;

  return (
    <Card className="overflow-hidden hover:border-primary/40 transition-colors">
      <Link to={`/deal/${deal.id}`} className="block p-3 space-y-2">
        {/* Line 1: Company + Contact */}
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight truncate">{deal.company || deal.name}</div>
          {deal.contact && (
            <div className="text-xs text-muted-foreground truncate">
              {deal.contact}{deal.contactTitle ? ` · ${deal.contactTitle}` : ''}
            </div>
          )}
        </div>

        {/* Line 2 + 3: ICP chip + Owner avatar */}
        <div className="flex items-center gap-2 flex-wrap">
          {icp && (
            <Badge variant="outline" className={cn('text-[10px] font-medium px-1.5 py-0 h-5', ICP_COLORS[icp] || ICP_COLORS.Other)}>
              {icp}
            </Badge>
          )}
          {owner && (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold', OWNER_COLORS[owner] || 'bg-muted text-foreground')}>
                {initials(owner)}
              </span>
              <span className="text-[11px] text-muted-foreground">{owner}</span>
            </span>
          )}
        </div>

        {/* Line 4: Last activity */}
        {lastActivity && (
          <div className="text-[11px] text-muted-foreground">
            Last activity: {formatDistanceToNowStrict(lastActivity, { addSuffix: true })}
          </div>
        )}

        {/* Line 5: Next step */}
        {(deal.nextStep || nextDate) && (
          <div className="text-[11px] text-muted-foreground/90 border-t border-border/60 pt-1.5 truncate">
            <span className="font-medium text-foreground/80">Next:</span>{' '}
            {deal.nextStep || '—'}
            {nextDate && <span> · {format(nextDate, 'MMM d')}</span>}
          </div>
        )}
      </Link>
      {children}
    </Card>
  );
}