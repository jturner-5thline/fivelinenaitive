import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, Zap, TrendingUp, Clock, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Deal } from '@/types/deal';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { useAllDealsSuggestions, DealSuggestion } from '@/hooks/useAllDealsSuggestions';

interface SmartSuggestionsDropdownProps {
  deals: Deal[];
}

const priorityConfig = {
  high: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
  medium: { color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  low: { color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-muted' },
};

const typeConfig = {
  warning: { icon: Zap, label: 'Follow Up', color: 'text-amber-600' },
  action: { icon: TrendingUp, label: 'Take Action', color: 'text-emerald-600' },
  opportunity: { icon: Sparkles, label: 'Opportunity', color: 'text-primary' },
  reminder: { icon: Clock, label: 'Due Soon', color: 'text-blue-600' },
};

export function SmartSuggestionsDropdown({ deals }: SmartSuggestionsDropdownProps) {
  const navigate = useNavigate();
  const { milestonesMap } = useAllMilestones();
  const { suggestions, counts } = useAllDealsSuggestions(deals, milestonesMap);
  const [open, setOpen] = useState(false);

  const hasNotifications = counts.total > 0;
  const highPriorityCount = counts.high;

  const handleSuggestionClick = (suggestion: DealSuggestion) => {
    setOpen(false);
    navigate(`/deal/${suggestion.dealId}`);
  };

  // Group suggestions by type
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, DealSuggestion[]> = {
      warning: [],
      action: [],
      opportunity: [],
      reminder: [],
    };
    suggestions.forEach(s => {
      if (groups[s.type]) {
        groups[s.type].push(s);
      }
    });
    return groups;
  }, [suggestions]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 relative"
        >
          <Lightbulb className="h-4 w-4" />
          Suggestions
          {hasNotifications && (
            <Badge 
              variant={highPriorityCount > 0 ? "destructive" : "secondary"}
              className="ml-1 h-5 min-w-5 px-1.5 text-xs"
            >
              {counts.total}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-popover">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold">Recommended Actions</span>
          {counts.total > 0 && (
            <Badge variant="outline" className="ml-auto text-xs">
              {counts.total} items
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {counts.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">All caught up!</p>
            <p className="text-xs mt-1">No recommendations right now</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="p-1">
              {Object.entries(groupedSuggestions).map(([type, items]) => {
                if (items.length === 0) return null;
                const config = typeConfig[type as keyof typeof typeConfig];
                const Icon = config.icon;
                
                return (
                  <div key={type} className="mb-3">
                    <div className={`px-2 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {config.label} ({items.length})
                    </div>
                    {items.slice(0, 5).map((suggestion) => {
                      const pConfig = priorityConfig[suggestion.priority];
                      return (
                        <DropdownMenuItem
                          key={suggestion.id}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="flex items-start gap-3 py-2.5 px-2 cursor-pointer hover:bg-accent/50 rounded-md mx-1"
                        >
                          <div className={`p-1.5 rounded-md ${pConfig.bg} shrink-0 mt-0.5`}>
                            <Icon className={`h-3.5 w-3.5 ${pConfig.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">
                              {suggestion.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {suggestion.description}
                            </p>
                            {suggestion.actionLabel && (
                              <span className={`inline-flex items-center gap-1 text-xs font-medium mt-1.5 ${pConfig.color}`}>
                                {suggestion.actionLabel}
                                <ArrowRight className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                    {items.length > 5 && (
                      <div className="px-3 py-1.5 text-xs text-muted-foreground">
                        +{items.length - 5} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
