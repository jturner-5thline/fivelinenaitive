import { useNavigate } from 'react-router-dom';
import { Bot, ChevronRight, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentSuggestions, useDismissAgentSuggestion } from '@/hooks/useAgentSuggestions';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600',
  medium: 'bg-amber-500/10 text-amber-600',
  low: 'bg-blue-500/10 text-blue-600',
};

export function AgentSuggestionsWidget() {
  const navigate = useNavigate();
  const { data: suggestions = [], isLoading } = useAgentSuggestions();
  const dismissSuggestion = useDismissAgentSuggestion();

  // Only show top 3 high-priority suggestions
  const topSuggestions = suggestions
    .filter((s) => s.priority === 'high' || s.priority === 'medium')
    .slice(0, 3);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (topSuggestions.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Recommended Agents
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={() => navigate('/agents')}
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {topSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="flex items-center justify-between p-2 rounded-lg bg-background/50 border group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{suggestion.name}</p>
                <Badge variant="outline" className={`text-xs mt-0.5 ${PRIORITY_COLORS[suggestion.priority]}`}>
                  {suggestion.priority} priority
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => dismissSuggestion.mutate(suggestion.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => navigate('/agents')}
              >
                Create
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
