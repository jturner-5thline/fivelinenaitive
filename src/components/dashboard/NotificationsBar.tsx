import { AlertTriangle, AlertCircle } from 'lucide-react';
import { Deal, DealLender } from '@/types/deal';
import { differenceInDays } from 'date-fns';

interface NotificationsBarProps {
  deals: Deal[];
}

interface StaleLender {
  dealName: string;
  lenderName: string;
  daysSinceUpdate: number;
}

const YELLOW_THRESHOLD_DAYS = 7;
const RED_THRESHOLD_DAYS = 14;

export function NotificationsBar({ deals }: NotificationsBarProps) {
  const now = new Date();
  
  const staleLenders: { yellow: StaleLender[]; red: StaleLender[] } = { yellow: [], red: [] };
  
  deals.forEach(deal => {
    deal.lenders?.forEach(lender => {
      if (lender.trackingStatus === 'active' && lender.updatedAt) {
        const daysSinceUpdate = differenceInDays(now, new Date(lender.updatedAt));
        
        if (daysSinceUpdate >= RED_THRESHOLD_DAYS) {
          staleLenders.red.push({
            dealName: deal.name,
            lenderName: lender.name,
            daysSinceUpdate,
          });
        } else if (daysSinceUpdate >= YELLOW_THRESHOLD_DAYS) {
          staleLenders.yellow.push({
            dealName: deal.name,
            lenderName: lender.name,
            daysSinceUpdate,
          });
        }
      }
    });
  });

  if (staleLenders.yellow.length === 0 && staleLenders.red.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {staleLenders.red.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm font-medium text-destructive">
            {staleLenders.red.length} lender{staleLenders.red.length !== 1 ? 's' : ''} need urgent update (14+ days)
          </span>
        </div>
      )}
      {staleLenders.yellow.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-sm font-medium text-warning">
            {staleLenders.yellow.length} lender{staleLenders.yellow.length !== 1 ? 's' : ''} approaching stale (7+ days)
          </span>
        </div>
      )}
    </div>
  );
}
