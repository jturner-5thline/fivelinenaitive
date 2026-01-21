import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
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

const DISMISSED_KEY = 'dismissedNotifications';

function getDismissedNotifications(): Record<string, number> {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setDismissedNotifications(dismissed: Record<string, number>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
}

export function NotificationsBar({ deals }: NotificationsBarProps) {
  const { preferences } = usePreferences();
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const now = new Date();
  
  useEffect(() => {
    setDismissed(getDismissedNotifications());
  }, []);
  
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
      // Check if dismissed and if the dismissal is still valid (within 24 hours)
      const dismissedAt = dismissed[deal.id];
      const isStillDismissed = dismissedAt && (Date.now() - dismissedAt) < 24 * 60 * 60 * 1000;
      
      if (!isStillDismissed) {
        staleDeals.push({
          dealId: deal.id,
          companyName: deal.company,
          lenderCount: staleLenderCount,
          maxDaysSinceUpdate: maxDays,
        });
      }
    }
  });

  const handleDismiss = (e: React.MouseEvent, dealId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const newDismissed = { ...dismissed, [dealId]: Date.now() };
    setDismissed(newDismissed);
    setDismissedNotifications(newDismissed);
  };

  if (staleDeals.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-destructive/30 scrollbar-track-transparent">
        {staleDeals.map((deal) => (
          <Link
            key={deal.dealId}
            to={`/deal/${deal.dealId}?highlight=stale`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 transition-colors cursor-pointer w-64 shrink-0 group"
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
            <button
              onClick={(e) => handleDismiss(e, deal.dealId)}
              className="h-5 w-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-opacity"
              title="Dismiss for 24 hours"
            >
              <X className="h-3 w-3 text-destructive" />
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
