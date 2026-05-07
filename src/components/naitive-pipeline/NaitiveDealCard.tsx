import { Link } from 'react-router-dom';
import { Deal } from '@/types/deal';
import { Card } from '@/components/ui/card';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

const ICP_STYLES: Record<string, string> = {
  'Debt Advisory': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'M&A': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Equity': 'bg-green-500/15 text-green-300 border-green-500/30',
  'Placement Agent': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'Broker': 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  'Other': 'bg-gray-500/15 text-gray-300 border-gray-500/30',
};

const OWNER_STYLES: Record<string, string> = {
  Paz: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  Flor: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
  James: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
};

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function formatLastActivity(updatedAt?: string) {
  if (!updatedAt) return null;
  const days = differenceInDays(new Date(), new Date(updatedAt));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatNextDate(d?: string | null) {
  if (!d) return null;
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return null; }
}

export function NaitiveDealCard({ deal, children, disableLink }: { deal: Deal; children?: React.ReactNode; disableLink?: boolean }) {
  const lastActivity = formatLastActivity(deal.updatedAt);
  const nextDate = formatNextDate(deal.nextStepDate);
  const owner = deal.ownedBy || deal.manager;

  const inner = (
    <Card className="deal-glass group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 p-3 space-y-2">
        {/* Line 1 */}
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-tight truncate" style={{ color: '#f1f6fc' }}>
            {deal.company || 'Unnamed'}
          </h3>
          {deal.contact && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{deal.contact}</p>
          )}
        </div>

        {/* Line 2 + 3: chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {deal.icpCategory && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', ICP_STYLES[deal.icpCategory] || ICP_STYLES['Other'])}>
              {deal.icpCategory}
            </span>
          )}
          {owner && (
            <span
              className={cn(
                'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-semibold border',
                OWNER_STYLES[owner] || 'bg-muted text-muted-foreground border-border'
              )}
              title={`Owned by ${owner}`}
            >
              {getInitials(owner)}
            </span>
          )}
        </div>

        {/* Line 4: last activity */}
        {lastActivity && (
          <p className="text-[11px] text-muted-foreground">Last activity: {lastActivity}</p>
        )}

        {/* Line 5: Next step */}
        {(deal.nextStep || nextDate) && (
          <p className="text-[11px] text-muted-foreground truncate">
            Next: {deal.nextStep || '—'}{nextDate ? ` · ${nextDate}` : ''}
          </p>
        )}

        {children}
    </Card>
  );

  if (disableLink) {
    return <div className="block w-full min-w-0">{inner}</div>;
  }
  return (
    <Link to={`/deal/${deal.id}`} className="block w-full min-w-0">
      {inner}
    </Link>
  );
}