import { useMemo, useState, useEffect } from 'react';
import { Flame, Trophy, ArrowRight, Users, FileSignature, Shield, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Deal } from '@/types/deal';
import { Link } from 'react-router-dom';
import { useFlexEngagementScores, DealFlexEngagement } from '@/hooks/useFlexEngagementScores';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface FlexLeaderboardWidgetProps {
  deals: Deal[];
}

const STORAGE_KEY = 'flex-leaderboard-widget-expanded';

export function FlexLeaderboardWidget({ deals }: FlexLeaderboardWidgetProps) {
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores, isLoading } = useFlexEngagementScores(dealIds);
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isExpanded));
  }, [isExpanded]);

  const topDeals = useMemo(() => {
    if (!flexEngagementScores) return [];
    
    // Get deals with engagement scores > 0
    const dealsWithScores: Array<{ deal: Deal; engagement: DealFlexEngagement }> = [];
    
    deals.forEach(deal => {
      const engagement = flexEngagementScores.get(deal.id);
      if (engagement && engagement.score > 0) {
        dealsWithScores.push({ deal, engagement });
      }
    });
    
    // Sort by score descending and take top 5
    return dealsWithScores
      .sort((a, b) => b.engagement.score - a.engagement.score)
      .slice(0, 5);
  }, [deals, flexEngagementScores]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'hot': return 'text-red-500';
      case 'warm': return 'text-orange-500';
      case 'cold': return 'text-blue-500';
      default: return 'text-muted-foreground';
    }
  };

  const getLevelBgColor = (level: string) => {
    switch (level) {
      case 'hot': return 'bg-red-500/10 border-red-500/30';
      case 'warm': return 'bg-orange-500/10 border-orange-500/30';
      case 'cold': return 'bg-blue-500/10 border-blue-500/30';
      default: return 'bg-muted';
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-3.5 w-3.5 text-yellow-500" />;
    if (index === 1) return <span className="text-xs font-bold text-slate-400">2</span>;
    if (index === 2) return <span className="text-xs font-bold text-amber-600">3</span>;
    return <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>;
  };

  if (isLoading) {
    return (
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            FLEx Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = topDeals.length === 0;
  const cardClass = isEmpty ? 'border-muted' : 'border-orange-500/30 bg-orange-500/5';

  return (
    <Card className={cardClass}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className={cn("pb-2", !isExpanded && "pb-4")}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-1">
                <Flame className="h-4 w-4 text-orange-500" />
                FLEx Leaderboard
                {!isEmpty && (
                  <Badge variant="outline" className="ml-auto text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/30">
                    Top {topDeals.length}
                  </Badge>
                )}
              </CardTitle>
              <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", isExpanded && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-0">
            {isEmpty ? (
              <p className="text-sm text-muted-foreground text-center py-4 px-4">
                No FLEx engagement yet. Push deals to FLEx to see lender interest.
              </p>
            ) : (
              <ScrollArea className="h-[160px] px-4 pb-4">
                <div className="space-y-2">
                  {topDeals.map(({ deal, engagement }, index) => (
                    <Link
                      key={deal.id}
                      to={`/deals/${deal.id}?tab=deal-management#flex-engagement-section`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-background/50 transition-colors group"
                    >
                      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        {getRankIcon(index)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {deal.company}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-[10px] text-muted-foreground">
                                    {engagement.lenderCount}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs">
                                {engagement.lenderCount} interested lender{engagement.lenderCount !== 1 ? 's' : ''}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          {engagement.hasTermSheetRequest && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <FileSignature className="h-3 w-3 text-green-500" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                  Term sheet requested
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {engagement.hasNdaRequest && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Shield className="h-3 w-3 text-blue-500" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                  NDA requested
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] ${getLevelBgColor(engagement.level)} ${getLevelColor(engagement.level)}`}
                      >
                        {engagement.level}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}