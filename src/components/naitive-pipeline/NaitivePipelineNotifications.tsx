import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info, Bell } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { NaitivePipelineNotification } from '@/hooks/useNaitivePipelineMetrics';

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Warning' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Info' },
};

export function NaitivePipelineNotifications({ notifications }: { notifications: NaitivePipelineNotification[] }) {
  const navigate = useNavigate();

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Pipeline Alerts</CardTitle>
          {notifications.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{notifications.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        {notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No alerts — pipeline is healthy</p>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {notifications.slice(0, 10).map(n => {
                const config = SEVERITY_CONFIG[n.severity];
                const Icon = config.icon;
                return (
                  <div
                    key={n.id}
                    className={cn("flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors", config.bg, config.border)}
                    data-deal-open-id={n.dealId}
                    onClick={() => navigate(`/deal/${n.dealId}`)}
                  >
                    <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", config.color)} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{n.dealName}</p>
                      <p className="text-[10px] text-muted-foreground">{n.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
