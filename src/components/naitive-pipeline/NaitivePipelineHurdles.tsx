import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { NaitiveDealHurdle } from '@/hooks/useNaitivePipelineMetrics';

const SEVERITY_STYLES = {
  high: { badge: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive' },
  medium: { badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', dot: 'bg-yellow-500' },
  low: { badge: 'bg-blue-500/10 text-blue-500 border-blue-500/30', dot: 'bg-blue-500' },
};

export function NaitivePipelineHurdles({ hurdles }: { hurdles: NaitiveDealHurdle[] }) {
  const navigate = useNavigate();

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Hurdles & Flags</CardTitle>
          {hurdles.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{hurdles.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        {hurdles.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No active hurdles</p>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-1.5">
              {hurdles.slice(0, 15).map((h, i) => {
                const style = SEVERITY_STYLES[h.severity];
                return (
                  <div
                    key={`${h.dealId}-${i}`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/deal/${h.dealId}`)}
                  >
                    <span className={cn("h-2 w-2 rounded-full flex-shrink-0", style.dot)} />
                    <span className="text-xs font-medium text-foreground truncate flex-1">{h.dealName}</span>
                    <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 whitespace-nowrap", style.badge)}>
                      {h.hurdle.length > 30 ? h.hurdle.slice(0, 30) + '…' : h.hurdle}
                    </Badge>
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
