import { useState } from 'react';
import { Bot, Sparkles, X, ChevronRight, RefreshCw, Zap, Clock, Target, Shield, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAgentSuggestions,
  useDismissAgentSuggestion,
  useApplyAgentSuggestion,
  AgentSuggestion,
} from '@/hooks/useAgentSuggestions';
import { useAnalyzeBehavior } from '@/hooks/useBehaviorInsights';

interface AgentSuggestionsPanelProps {
  onCreateAgent: (suggestion: AgentSuggestion) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  pipeline: <TrendingUp className="h-4 w-4" />,
  lender: <Target className="h-4 w-4" />,
  activity: <Clock className="h-4 w-4" />,
  risk: <Shield className="h-4 w-4" />,
  competitive: <Zap className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

export function AgentSuggestionsPanel({ onCreateAgent }: AgentSuggestionsPanelProps) {
  const { data: suggestions = [], isLoading } = useAgentSuggestions();
  const dismissSuggestion = useDismissAgentSuggestion();
  const applySuggestion = useApplyAgentSuggestion();
  const analyzeBehavior = useAnalyzeBehavior();

  const handleApply = (suggestion: AgentSuggestion) => {
    onCreateAgent(suggestion);
    applySuggestion.mutate(suggestion.id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Recommended Agents
          </CardTitle>
          <CardDescription>
            AI-suggested agents based on your activity patterns
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => analyzeBehavior.mutate()}
          disabled={analyzeBehavior.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${analyzeBehavior.isPending ? 'animate-spin' : ''}`} />
          Analyze
        </Button>
      </CardHeader>

      <CardContent>
        {suggestions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No agent suggestions yet</p>
            <p className="text-sm mt-1">
              Click "Analyze" to scan your activity for agent recommendations
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApply={() => handleApply(suggestion)}
                  onDismiss={() => dismissSuggestion.mutate(suggestion.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: AgentSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const categoryIcon = CATEGORY_ICONS[suggestion.category || ''] || <Bot className="h-4 w-4" />;

  return (
    <div className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            {categoryIcon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{suggestion.name}</p>
              <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[suggestion.priority]}`}>
                {suggestion.priority}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {suggestion.description}
            </p>
            
            {suggestion.suggested_triggers.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {suggestion.suggested_triggers.map((trigger, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {trigger.trigger_type.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDismiss}
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1"
            onClick={onApply}
          >
            Create
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {suggestion.reasoning && (
        <button
          className="text-xs text-primary mt-3 hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide reasoning' : 'Why this agent?'}
        </button>
      )}

      {expanded && (
        <div className="mt-2 p-3 bg-muted/50 rounded text-xs text-muted-foreground space-y-2">
          <p>{suggestion.reasoning}</p>
          {suggestion.suggested_prompt && (
            <div className="pt-2 border-t border-border/50">
              <p className="font-medium text-foreground mb-1">Suggested Prompt:</p>
              <p className="italic">{suggestion.suggested_prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
