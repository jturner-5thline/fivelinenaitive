import { Link } from 'react-router-dom';
import { Flag, ExternalLink, MessageSquare } from 'lucide-react';
import { Deal } from '@/types/deal';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FlaggedDealsPanelProps {
  deals: Deal[];
}

export function FlaggedDealsPanel({ deals }: FlaggedDealsPanelProps) {
  const { formatCurrencyValue } = usePreferences();
  const flaggedDeals = deals.filter((deal) => deal.isFlagged);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 relative">
          <Flag className="h-4 w-4" />
          Flagged
          {flaggedDeals.length > 0 && (
            <Badge 
              variant="destructive" 
              className="h-5 min-w-5 px-1.5 text-xs absolute -top-2 -right-2"
            >
              {flaggedDeals.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Flagged Deals ({flaggedDeals.length})
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-8rem)] mt-6 pr-4">
          {flaggedDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <Flag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No flagged deals</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Flag deals to mark them for discussion
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {flaggedDeals.map((deal) => (
                <Link
                  key={deal.id}
                  to={`/deal/${deal.id}`}
                  className="block p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{deal.company}</h3>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatCurrencyValue(deal.value)}
                      </p>
                    </div>
                    <Flag className="h-4 w-4 text-destructive fill-current shrink-0 mt-1" />
                  </div>
                  
                  {deal.flagNotes ? (
                    <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border/50">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {deal.flagNotes}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 mt-3 italic">
                      No notes added
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
