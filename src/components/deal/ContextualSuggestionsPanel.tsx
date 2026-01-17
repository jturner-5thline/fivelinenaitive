import { AlertTriangle, Lightbulb, Bell, Target, ChevronRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useContextualSuggestions, Suggestion } from '@/hooks/useContextualSuggestions';
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ContextualSuggestionsPanelProps {
  deal: {
    id: string;
    company: string;
    stage: string;
    status: string;
    updatedAt?: string;
    lenders?: Array<{
      id: string;
      name: string;
      stage: string;
      updatedAt?: string;
      notes?: string;
    }>;
    milestones?: Array<{
      id: string;
      title: string;
      completed: boolean;
      dueDate?: string;
    }>;
    notes?: string;
  } | null;
  onAction?: (suggestion: Suggestion) => void;
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

export function ContextualSuggestionsPanel({ deal, onAction }: ContextualSuggestionsPanelProps) {
  const { suggestions } = useContextualSuggestions(deal);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [, setSearchParams] = useSearchParams();

  const visibleSuggestions = suggestions.filter(s => !dismissedIds.has(s.id));

  const handleDismiss = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set(prev).add(id));
  }, []);

  const handleAction = useCallback((suggestion: Suggestion) => {
    if (onAction) {
      onAction(suggestion);
      return;
    }

    // Default handling
    if (suggestion.actionType === 'navigate' && suggestion.actionData?.tab) {
      setSearchParams({ tab: suggestion.actionData.tab as string });
    }
  }, [onAction, setSearchParams]);

  if (visibleSuggestions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Smart Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <Lightbulb className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground">
              All caught up! No suggestions at this time.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Smart Suggestions
            {visibleSuggestions.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {visibleSuggestions.length}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border">
            {visibleSuggestions.map((suggestion) => {
              const Icon = typeIcons[suggestion.type];
              
              return (
                <div
                  key={suggestion.id}
                  className="group relative p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleAction(suggestion)}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className={cn(
                      'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
                      typeColors[suggestion.type]
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium leading-tight">
                          {suggestion.title}
                        </h4>
                        <Badge 
                          variant="outline" 
                          className={cn('text-xs flex-shrink-0', priorityBadges[suggestion.priority])}
                        >
                          {suggestion.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {suggestion.description}
                      </p>
                      
                      {suggestion.actionLabel && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-0 mt-2 text-xs text-primary hover:text-primary/80 hover:bg-transparent"
                        >
                          {suggestion.actionLabel}
                          <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      )}
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
      </CardContent>
    </Card>
  );
}
