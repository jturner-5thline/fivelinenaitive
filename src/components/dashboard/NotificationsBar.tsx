import { AlertTriangle, AlertCircle } from 'lucide-react';
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
  const redThreshold = preferences.lenderUpdateRedDays;
  
  const staleDeals: { yellow: StaleDeal[]; red: StaleDeal[] } = { yellow: [], red: [] };
  
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
      const staleDeal: StaleDeal = {
        dealId: deal.id,
        companyName: deal.company,
        lenderCount: staleLenderCount,
        maxDaysSinceUpdate: maxDays,
      };
      
      if (maxDays >= redThreshold) {
        staleDeals.red.push(staleDeal);
      } else {
        staleDeals.yellow.push(staleDeal);
      }
    }
  });

  if (staleDeals.yellow.length === 0 && staleDeals.red.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {staleDeals.red.map((deal) => (
        <Link
          key={`red-${deal.dealId}`}
          to={`/deal/${deal.dealId}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 transition-colors cursor-pointer"
        >
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm font-medium text-destructive">
            {deal.companyName}
          </span>
        </Link>
      ))}
      {staleDeals.yellow.map((deal) => (
        <Link
          key={`yellow-${deal.dealId}`}
          to={`/deal/${deal.dealId}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/20 hover:bg-warning/20 transition-colors cursor-pointer"
        >
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-sm font-medium text-warning">
            {deal.companyName}
          </span>
        </Link>
      ))}
    </div>
  );
}
