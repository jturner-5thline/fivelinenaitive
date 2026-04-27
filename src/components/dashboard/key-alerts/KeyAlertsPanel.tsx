import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Bell, Clock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useKeyAlerts, KeyAlert, KeyAlertType } from './useKeyAlerts';

const PRIORITY_BORDER: Record<KeyAlert['priority'], string> = {
  high: 'border-l-2 border-destructive',
  medium: 'border-l-2 border-amber-500',
  low: 'border-l-2 border-border',
};

const PRIORITY_ICON_COLOR: Record<KeyAlert['priority'], string> = {
  high: 'text-destructive',
  medium: 'text-amber-500',
  low: 'text-muted-foreground',
};

const TYPE_ICONS: Record<KeyAlertType, typeof AlertCircle> = {
  stale_lender: Clock,
  missing_followup: AlertCircle,
  at_risk: AlertCircle,
  milestone_overdue: AlertCircle,
};

interface KeyAlertsPanelProps {
  /** Called after the user clicks an alert; use this to close the parent modal. */
  onAlertOpen?: (alert: KeyAlert) => void;
}

/**
 * Key Alerts page rendered inside the Deals dialog. Reuses the shared
 * `useKeyAlerts` data feed but renders without Card chrome so it sits
 * cleanly inside the modal viewport.
 */
export function KeyAlertsPanel({ onAlertOpen }: KeyAlertsPanelProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const alerts = useKeyAlerts({ dismissed });

  const highCount = alerts.filter((a) => a.priority === 'high').length;

  const handleAlertClick = (alert: KeyAlert) => {
    onAlertOpen?.(alert);
    navigate(`/deal/${alert.dealId}`);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Summary row — uses the dialog's own header above; this is a slim status strip. */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 sm:px-6 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bell className="h-3.5 w-3.5" />
          <span>
            {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'}
          </span>
          {highCount > 0 && (
            <Badge variant="destructive" className="h-5 text-[10px]">
              {highCount} high
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-2 sm:px-3 py-2">
        <ScrollArea className="h-full max-h-[60vh] pr-2">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground">
                No alerts on your deals right now.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {alerts.map((alert) => {
                const Icon = TYPE_ICONS[alert.type];
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors',
                      'hover:bg-muted/50',
                      PRIORITY_BORDER[alert.priority],
                    )}
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        PRIORITY_ICON_COLOR[alert.priority],
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => handleAlertClick(alert)}
                      className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
                    >
                      <p className="text-sm text-foreground leading-snug">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {alert.description}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() =>
                        setDismissed((prev) => new Set(prev).add(alert.id))
                      }
                      aria-label={`Dismiss alert: ${alert.title}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}