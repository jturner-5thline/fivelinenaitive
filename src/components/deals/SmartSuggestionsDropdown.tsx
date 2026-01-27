import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, AlertTriangle, Target, ChevronRight } from 'lucide-react';
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
  high: { color: 'text-destructive', bg: 'bg-destructive/10' },
  medium: { color: 'text-amber-500', bg: 'bg-amber-500/10' },
  low: { color: 'text-blue-500', bg: 'bg-blue-500/10' },
};

const typeConfig = {
  warning: { icon: AlertTriangle, label: 'Warning' },
  action: { icon: Target, label: 'Action Needed' },
  opportunity: { icon: Lightbulb, label: 'Opportunity' },
  reminder: { icon: AlertTriangle, label: 'Reminder' },
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
          <Lightbulb className="h-4 w-4 text-primary" />
          Smart Suggestions
          {counts.total > 0 && (
            <Badge variant="outline" className="ml-auto text-xs">
              {counts.total} total
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {counts.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No suggestions right now
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="p-1">
              {Object.entries(groupedSuggestions).map(([type, items]) => {
                if (items.length === 0) return null;
                const config = typeConfig[type as keyof typeof typeConfig];
                const Icon = config.icon;
                
                return (
                  <div key={type} className="mb-2">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      {config.label} ({items.length})
                    </div>
                    {items.slice(0, 5).map((suggestion) => {
                      const pConfig = priorityConfig[suggestion.priority];
                      return (
                        <DropdownMenuItem
                          key={suggestion.id}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="flex items-start gap-2 py-2 cursor-pointer"
                        >
                          <div className={`p-1 rounded ${pConfig.bg} shrink-0 mt-0.5`}>
                            <Icon className={`h-3 w-3 ${pConfig.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {suggestion.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {suggestion.description}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </DropdownMenuItem>
                      );
                    })}
                    {items.length > 5 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
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
