import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Lightbulb, Bell, Target, ChevronRight, X, Filter, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAllDealsSuggestions, DealSuggestion } from '@/hooks/useAllDealsSuggestions';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { Deal } from '@/types/deal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AllSuggestionsWidgetProps {
  deals: Deal[];
}

const typeIcons = {
  warning: AlertTriangle,
  action: Target,
  opportunity: Lightbulb,
  reminder: Bell,
};

const typeColors = {
  warning: 'text-amber-500 bg-amber-500/10',
  action: 'text-blue-500 bg-blue-500/10',
  opportunity: 'text-green-500 bg-green-500/10',
  reminder: 'text-purple-500 bg-purple-500/10',
};

const priorityBadges = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-muted',
};

const typeLabels = {
  warning: 'Warnings',
  action: 'Actions',
  opportunity: 'Opportunities',
  reminder: 'Reminders',
};

export function AllSuggestionsWidget({ deals }: AllSuggestionsWidgetProps) {
  const navigate = useNavigate();
  const { milestonesMap } = useAllMilestones();
  const { suggestions, counts } = useAllDealsSuggestions(deals, milestonesMap);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'warning' | 'action' | 'opportunity' | 'reminder'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showLimit, setShowLimit] = useState(3);

  const visibleSuggestions = useMemo(() => {
    return suggestions
      .filter(s => !dismissedIds.has(s.id))
      .filter(s => filterType === 'all' || s.type === filterType)
      .filter(s => filterPriority === 'all' || s.priority === filterPriority);
  }, [suggestions, dismissedIds, filterType, filterPriority]);

  const displayedSuggestions = visibleSuggestions.slice(0, showLimit);
  const hasMore = visibleSuggestions.length > showLimit;

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const handleAction = (suggestion: DealSuggestion) => {
    navigate(`/deal/${suggestion.dealId}`);
  };

  const activeFilters = (filterType !== 'all' ? 1 : 0) + (filterPriority !== 'all' ? 1 : 0);

  if (suggestions.length === 0) {
    return null; // Don't show widget if no suggestions
  }

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Smart Suggestions
                </CardTitle>
                {counts.high > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {counts.high} urgent
                  </Badge>
                )}
                {visibleSuggestions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {visibleSuggestions.length}
                  </Badge>
                )}
                <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                    <Filter className="h-3 w-3" />
                    Filter
                    {activeFilters > 0 && (
                      <Badge variant="secondary" className="h-4 w-4 p-0 text-[10px] flex items-center justify-center">
                        {activeFilters}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">By Type</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setFilterType('all')} className={filterType === 'all' ? 'bg-accent' : ''}>
                    All Types
                  </DropdownMenuItem>
                  {(['warning', 'action', 'opportunity', 'reminder'] as const).map(type => (
                    <DropdownMenuItem 
                      key={type} 
                      onClick={() => setFilterType(type)}
                      className={cn("gap-2", filterType === type && 'bg-accent')}
                    >
                      {(() => { const Icon = typeIcons[type]; return <Icon className="h-3 w-3" />; })()}
                      {typeLabels[type]}
                      <span className="ml-auto text-xs text-muted-foreground">{counts.byType[type]}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">By Priority</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setFilterPriority('all')} className={filterPriority === 'all' ? 'bg-accent' : ''}>
                    All Priorities
                  </DropdownMenuItem>
                  {(['high', 'medium', 'low'] as const).map(priority => (
                    <DropdownMenuItem 
                      key={priority} 
                      onClick={() => setFilterPriority(priority)}
                      className={filterPriority === priority ? 'bg-accent' : ''}
                    >
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {priority === 'high' ? counts.high : priority === 'medium' ? counts.medium : counts.low}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-0">
            {visibleSuggestions.length === 0 ? (
              <div className="text-center py-6 px-4">
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <Lightbulb className="h-5 w-5 text-green-500" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeFilters > 0 ? 'No suggestions match your filters.' : 'All caught up! No suggestions at this time.'}
                </p>
                {activeFilters > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 text-xs"
                    onClick={() => { setFilterType('all'); setFilterPriority('all'); }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <ScrollArea className="max-h-[350px]">
                  <div className="divide-y divide-border">
                    {displayedSuggestions.map((suggestion) => {
                      const Icon = typeIcons[suggestion.type];
                      
                      return (
                        <div
                          key={suggestion.id}
                          className="group relative p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => handleAction(suggestion)}
                        >
                          <div className="flex gap-3">
                            {/* Icon */}
                            <div className={cn(
                              'flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center',
                              typeColors[suggestion.type]
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-sm font-medium leading-tight line-clamp-1">
                                  {suggestion.title}
                                </h4>
                                <Badge 
                                  variant="outline" 
                                  className={cn('text-[10px] flex-shrink-0', priorityBadges[suggestion.priority])}
                                >
                                  {suggestion.priority}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {suggestion.description}
                              </p>
                            </div>
                          </div>

                          {/* Dismiss button */}
                          <button
                            onClick={(e) => handleDismiss(suggestion.id, e)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                
                {hasMore && (
                  <div className="p-2 border-t border-border">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-xs h-7"
                      onClick={() => setShowLimit(prev => prev + 10)}
                    >
                      Show more ({visibleSuggestions.length - showLimit} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
