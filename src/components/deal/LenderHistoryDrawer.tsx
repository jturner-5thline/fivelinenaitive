import { format, formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Calendar, Building2, MapPin, DollarSign, FileText } from 'lucide-react';
import type { LenderHistoryWarning, LenderHistoryMatch } from '@/hooks/useLenderHistoryWarning';
import { cn } from '@/lib/utils';

interface LenderHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warning: LenderHistoryWarning | null;
  currentDealContext?: {
    industry?: string;
    dealSize?: number;
    geography?: string;
  };
}

export function LenderHistoryDrawer({
  open,
  onOpenChange,
  warning,
  currentDealContext,
}: LenderHistoryDrawerProps) {
  if (!warning) return null;

  // Group matches by deal
  const byDeal = new Map<string, { dealName: string; matches: LenderHistoryMatch[] }>();
  for (const m of warning.matches) {
    if (!byDeal.has(m.dealId)) {
      byDeal.set(m.dealId, { dealName: m.dealName, matches: [] });
    }
    byDeal.get(m.dealId)!.matches.push(m);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Pass History: {warning.lenderName}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {warning.totalPasses} pass{warning.totalPasses !== 1 ? 'es' : ''} in recent history
            · {warning.matchingReasons.length} matching reason{warning.matchingReasons.length !== 1 ? 's' : ''} with this deal
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
          <div className="px-6 py-4 space-y-4">
            {/* Matching reasons summary */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Overlapping Reasons
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {warning.matchingReasons.map((reason) => (
                  <Badge key={reason} variant="outline" className="text-xs border-amber-500/30 text-amber-400">
                    {reason}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Current deal context for comparison */}
            {currentDealContext && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    This Deal
                  </h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {currentDealContext.industry && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {currentDealContext.industry}
                      </span>
                    )}
                    {currentDealContext.dealSize && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        ${(currentDealContext.dealSize / 1000000).toFixed(1)}M
                      </span>
                    )}
                    {currentDealContext.geography && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {currentDealContext.geography}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Past deals */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Pass History
              </h4>
              {Array.from(byDeal.entries()).map(([dealId, { dealName, matches }]) => (
                <div
                  key={dealId}
                  className="rounded-lg border border-border bg-muted/30 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{dealName}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDistanceToNow(new Date(matches[0].createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Deal context from the pass */}
                  <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {matches[0].dealIndustry && (
                      <span className="flex items-center gap-0.5">
                        <Building2 className="h-2.5 w-2.5" />
                        {matches[0].dealIndustry}
                      </span>
                    )}
                    {matches[0].dealSize && (
                      <span className="flex items-center gap-0.5">
                        <DollarSign className="h-2.5 w-2.5" />
                        ${(matches[0].dealSize / 1000000).toFixed(1)}M
                      </span>
                    )}
                    {matches[0].dealGeography && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {matches[0].dealGeography}
                      </span>
                    )}
                  </div>

                  {/* Reasons */}
                  <div className="flex flex-wrap gap-1">
                    {matches.map((m, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={cn(
                          'text-[10px]',
                          // Highlight reasons that match current deal
                          warning.matchingReasons.includes(m.reasonLabel) &&
                            'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        )}
                      >
                        {m.reasonLabel}
                      </Badge>
                    ))}
                  </div>

                  {/* Details/notes */}
                  {matches.some(m => m.reasonDetails) && (
                    <div className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
                      <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-3">
                        {matches.find(m => m.reasonDetails)?.reasonDetails}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
