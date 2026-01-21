import { useState } from 'react';
import { Sparkles, X, ChevronRight, AlertTriangle, Lightbulb, TrendingUp, Clock, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useWorkflowSuggestions,
  useBehaviorInsights,
  useDismissSuggestion,
  useDismissInsight,
  useApplySuggestion,
  useAnalyzeBehavior,
  WorkflowSuggestion,
  BehaviorInsight,
} from '@/hooks/useBehaviorInsights';
import type { WorkflowData, TriggerType, ActionType } from './WorkflowBuilder';

interface WorkflowSuggestionsPanelProps {
  onCreateWorkflow: (data: WorkflowData) => void;
}

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  bottleneck: <AlertTriangle className="h-4 w-4" />,
  pattern: <TrendingUp className="h-4 w-4" />,
  opportunity: <Lightbulb className="h-4 w-4" />,
  efficiency: <Clock className="h-4 w-4" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600',
  warning: 'bg-amber-500/10 text-amber-600',
  info: 'bg-blue-500/10 text-blue-600',
};

export function WorkflowSuggestionsPanel({ onCreateWorkflow }: WorkflowSuggestionsPanelProps) {
  const { data: suggestions = [], isLoading: suggestionsLoading } = useWorkflowSuggestions();
  const { data: insights = [], isLoading: insightsLoading } = useBehaviorInsights();
  const dismissSuggestion = useDismissSuggestion();
  const dismissInsight = useDismissInsight();
  const applySuggestion = useApplySuggestion();
  const analyzeBehavior = useAnalyzeBehavior();

  const handleApplySuggestion = (suggestion: WorkflowSuggestion) => {
    const workflowData: WorkflowData = {
      name: suggestion.name,
      description: suggestion.description,
      isActive: true,
      triggerType: suggestion.trigger_type as TriggerType,
      triggerConfig: suggestion.trigger_config,
      actions: suggestion.actions.map((action, idx) => ({
        id: `action-${Date.now()}-${idx}`,
        type: action.type as ActionType,
        config: action.config,
      })),
    };

    onCreateWorkflow(workflowData);
    applySuggestion.mutate(suggestion.id);
  };

  const isLoading = suggestionsLoading || insightsLoading;

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

  const hasSuggestions = suggestions.length > 0 || insights.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Workflow Suggestions
          </CardTitle>
          <CardDescription>
            Personalized recommendations based on your activity
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
        {!hasSuggestions ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No suggestions yet</p>
            <p className="text-sm mt-1">
              Click "Analyze" to scan your activity for workflow opportunities
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {/* Insights Section */}
              {insights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Insights</h4>
                  {insights.slice(0, 3).map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={() => dismissInsight.mutate(insight.id)}
                    />
                  ))}
                </div>
              )}

              {/* Suggestions Section */}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Recommended Workflows</h4>
                  {suggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onApply={() => handleApplySuggestion(suggestion)}
                      onDismiss={() => dismissSuggestion.mutate(suggestion.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function InsightCard({
  insight,
  onDismiss,
}: {
  insight: BehaviorInsight;
  onDismiss: () => void;
}) {
  return (
    <div className={`p-3 rounded-lg border ${SEVERITY_COLORS[insight.severity]} relative group`}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDismiss}
      >
        <X className="h-3 w-3" />
      </Button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{INSIGHT_ICONS[insight.insight_type]}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{insight.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {insight.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: WorkflowSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{suggestion.name}</p>
            <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[suggestion.priority]}`}>
              {suggestion.priority}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {suggestion.description}
          </p>
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
            Use
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {suggestion.reasoning && (
        <button
          className="text-xs text-primary mt-2 hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide reasoning' : 'Why this suggestion?'}
        </button>
      )}

      {expanded && (
        <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
          {suggestion.reasoning}
        </p>
      )}
    </div>
  );
}
