import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, FileX, MessageSquareWarning, ChevronRight, X, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { differenceInBusinessDays } from 'date-fns';
import { isPostSubmissionDealStage } from '@/utils/dealStageUtils';
import { useIsDemoAccount } from '@/hooks/useIsDemoAccount';

interface ProactiveAlertBarProps {
  deal: {
    id: string;
    status?: string;
    stage?: string;
    lenders?: Array<{
      id: string;
      name: string;
      stage: string;
      updatedAt?: string;
      trackingStatus?: string;
    }>;
    milestones?: Array<{
      id: string;
      title: string;
      completed: boolean;
      dueDate?: string;
    }>;
  };
  checklistTotal?: number;
  checklistComplete?: number;
  outstandingItemsCount?: number;
  infoRequestCount?: number;
  onNavigate?: (tab: string) => void;
}

interface Alert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  icon: typeof AlertTriangle;
  message: string;
  count?: number;
  tab?: string;
}

export function ProactiveAlertBar({ deal, checklistTotal = 0, checklistComplete = 0, outstandingItemsCount = 0, infoRequestCount = 0, onNavigate }: ProactiveAlertBarProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const isDemoAccount = useIsDemoAccount();

  const alerts = useMemo(() => {
    const result: Alert[] = [];

    // Suppress all alerts for on-hold or archived deals
    const suppressedStatuses = ['on-hold', 'on_hold', 'archived'];
    if (deal.status && suppressedStatuses.includes(deal.status)) return result;
    // Demo account: never surface missing-doc / outstanding-item nags.
    const suppressMissingAndOutstanding = isDemoAccount;

    const now = new Date();

    // Stale lenders — only for deals at or past "Submitted to Lenders"
    if (isPostSubmissionDealStage(deal.stage)) {
      const excludedLenderStages = ['passed', 'on hold', 'on deck', 'not a fit', 'unresponsive'];
      const activeLenders = (deal.lenders || []).filter(l => 
        (l.trackingStatus === 'active' || !l.trackingStatus) &&
        !excludedLenderStages.includes((l.stage || '').toLowerCase())
      );
      const staleLenders = activeLenders.filter(l => {
        if (!l.updatedAt) return true;
        return differenceInBusinessDays(now, new Date(l.updatedAt)) >= 5;
      });
      if (staleLenders.length > 0) {
        result.push({
          id: 'stale-lenders',
          type: 'warning',
          icon: Users,
          message: `${staleLenders.length} lender${staleLenders.length > 1 ? 's' : ''} need${staleLenders.length === 1 ? 's' : ''} an update`,
          count: staleLenders.length,
          tab: 'lenders',
        });
      }
    }

    // Overdue milestones
    const overdueMilestones = (deal.milestones || []).filter(m => !m.completed && m.dueDate && new Date(m.dueDate) < now);
    if (overdueMilestones.length > 0) {
      result.push({
        id: 'overdue-milestones',
        type: 'danger',
        icon: Clock,
        message: `${overdueMilestones.length} milestone${overdueMilestones.length > 1 ? 's' : ''} overdue`,
        count: overdueMilestones.length,
        tab: 'deal-info',
      });
    }

    // Missing docs
    const missingDocs = checklistTotal - checklistComplete;
    if (!suppressMissingAndOutstanding && checklistTotal > 0 && missingDocs > 0) {
      result.push({
        id: 'missing-docs',
        type: 'info',
        icon: FileX,
        message: `${missingDocs} required document${missingDocs > 1 ? 's' : ''} missing`,
        count: missingDocs,
        tab: 'data-room',
      });
    }

    // Outstanding items
    if (!suppressMissingAndOutstanding && outstandingItemsCount > 0) {
      result.push({
        id: 'outstanding-items',
        type: 'warning',
        icon: AlertTriangle,
        message: `${outstandingItemsCount} outstanding item${outstandingItemsCount > 1 ? 's' : ''} pending`,
        count: outstandingItemsCount,
        tab: 'deal-info',
      });
    }

    // Info requests
    if (infoRequestCount > 0) {
      result.push({
        id: 'info-requests',
        type: 'danger',
        icon: MessageSquareWarning,
        message: `${infoRequestCount} info request${infoRequestCount > 1 ? 's' : ''} awaiting response`,
        count: infoRequestCount,
        tab: 'deal-management',
      });
    }

    return result;
  }, [deal, checklistTotal, checklistComplete, outstandingItemsCount, infoRequestCount, isDemoAccount]);

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) return null;

  const typeStyles = {
    danger: 'bg-destructive/10 text-destructive border-destructive/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  };

  return (
    <div className="flex flex-wrap gap-2">
      {visibleAlerts.map(alert => {
        const Icon = alert.icon;
        return (
          <button
            key={alert.id}
            onClick={() => alert.tab && onNavigate?.(alert.tab)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all hover:scale-[1.02] hover:shadow-sm cursor-pointer group",
              typeStyles[alert.type]
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{alert.message}</span>
            <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span
              role="button"
              className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
              onClick={(e) => {
                e.stopPropagation();
                setDismissed(prev => new Set(prev).add(alert.id));
              }}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
