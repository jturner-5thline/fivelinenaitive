import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, Users, TrendingDown, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ProactiveAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  dealId?: string;
  actionLabel?: string;
  actionPrompt?: string;
}

interface ProactiveAlertsProps {
  onAction: (prompt: string) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-chat`;

const alertIcons: Record<string, React.ReactNode> = {
  stale_deal: <TrendingDown className="h-3.5 w-3.5" />,
  overdue_milestone: <Clock className="h-3.5 w-3.5" />,
  stale_lenders: <Users className="h-3.5 w-3.5" />,
  low_coverage: <AlertTriangle className="h-3.5 w-3.5" />,
};

const severityColors: Record<string, string> = {
  critical: 'border-destructive/50 bg-destructive/10 text-destructive',
  warning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
  info: 'border-primary/40 bg-primary/10 text-primary',
};

export function ProactiveAlerts({ onAction }: ProactiveAlertsProps) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('dismissedAlerts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ includeAlerts: true }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAlerts(data.alerts || []);
      }
    } catch (e) {
      console.error('Failed to fetch proactive alerts:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  // Visibility-aware: skip ticks while tab is hidden, refresh on return.
  useVisibilityAwareInterval(fetchAlerts, 5 * 60 * 1000);

  const handleDismiss = (alertKey: string) => {
    const newDismissed = new Set(dismissed).add(alertKey);
    setDismissed(newDismissed);
    sessionStorage.setItem('dismissedAlerts', JSON.stringify([...newDismissed]));
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(`${a.type}-${a.title}`));
  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical').length;

  if (loading || visibleAlerts.length === 0) return null;

  const displayAlerts = expanded ? visibleAlerts : visibleAlerts.slice(0, 2);

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium text-muted-foreground">
            Proactive Alerts
          </span>
          {criticalCount > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[9px]">
              {criticalCount} critical
            </Badge>
          )}
        </div>
        {visibleAlerts.length > 2 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[10px] text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Less' : `+${visibleAlerts.length - 2} more`}
          </Button>
        )}
      </div>

      {displayAlerts.map((alert, i) => {
        const alertKey = `${alert.type}-${alert.title}`;
        return (
          <div
            key={i}
            className={cn(
              'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-all duration-200',
              severityColors[alert.severity]
            )}
          >
            <span className="mt-0.5 shrink-0">
              {alertIcons[alert.type] || <AlertTriangle className="h-3.5 w-3.5" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium leading-tight">{alert.title}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{alert.description}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {alert.actionPrompt && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px]"
                  onClick={() => onAction(alert.actionPrompt!)}
                >
                  {alert.actionLabel || 'Fix'}
                </Button>
              )}
              <button
                className="text-[10px] opacity-50 hover:opacity-100 transition-opacity"
                onClick={() => handleDismiss(alertKey)}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
