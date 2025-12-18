import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Deal } from '@/types/deal';
import { differenceInDays } from 'date-fns';
import { usePreferences } from '@/contexts/PreferencesContext';

interface NotificationsBarProps {
  deals: Deal[];
}

interface StaleDeal {
  dealId: string;
  companyName: string;
  lenderCount: number;
  maxDaysSinceUpdate: number;
}

export function NotificationsBar({ deals }: NotificationsBarProps) {
  const { preferences } = usePreferences();
  const now = new Date();
  
  const yellowThreshold = preferences.lenderUpdateYellowDays;
  
  const staleDeals: StaleDeal[] = [];
  
  deals.forEach(deal => {
    let maxDays = 0;
    let staleLenderCount = 0;
    
    deal.lenders?.forEach(lender => {
      if (lender.trackingStatus === 'active' && lender.updatedAt) {
        const daysSinceUpdate = differenceInDays(now, new Date(lender.updatedAt));
        if (daysSinceUpdate >= yellowThreshold) {
          staleLenderCount++;
          maxDays = Math.max(maxDays, daysSinceUpdate);
        }
      }
    });
    
    if (staleLenderCount > 0) {
      staleDeals.push({
        dealId: deal.id,
        companyName: deal.company,
        lenderCount: staleLenderCount,
        maxDaysSinceUpdate: maxDays,
      });
    }
  });

  if (staleDeals.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {staleDeals.map((deal) => (
        <Link
          key={deal.dealId}
          to={`/deal/${deal.dealId}?highlight=stale`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 transition-colors cursor-pointer w-64"
        >
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium text-destructive truncate">
              {deal.companyName}
            </span>
            <span className="text-xs text-destructive/70">
              {deal.lenderCount} lender{deal.lenderCount !== 1 ? 's' : ''} need update ({deal.maxDaysSinceUpdate}d)
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
