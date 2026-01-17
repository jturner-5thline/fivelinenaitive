import { useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useActivitySummary } from '@/hooks/useActivitySummary';
import { format } from 'date-fns';

interface ActivitySummaryPanelProps {
  dealInfo: {
    company: string;
    value: number;
    stage: string;
    status: string;
  };
  activities: Array<{ type: string; description: string; timestamp: string }>;
  lenders: Array<{ name: string; stage: string; updatedAt?: string }>;
  milestones: Array<{ title: string; completed: boolean; dueDate?: string }>;
}

export function ActivitySummaryPanel({ 
  dealInfo, 
  activities, 
  lenders, 
  milestones 
}: ActivitySummaryPanelProps) {
  const { summary, isLoading, generateSummary, clearSummary } = useActivitySummary();
  const [isExpanded, setIsExpanded] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week'>('week');

  const handleGenerate = async (selectedPeriod: 'day' | 'week') => {
    setPeriod(selectedPeriod);
    await generateSummary({
      dealInfo,
      activities,
      lenders,
      milestones,
    }, selectedPeriod);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Activity Summary
            <Badge variant="outline" className="text-xs font-normal">Beta</Badge>
          </CardTitle>
          {summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSummary}
              className="h-7 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!summary && !isLoading && (
          <div className="text-center py-6">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Generate an AI summary of deal activity
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerate('day')}
              >
                Daily Digest
              </Button>
              <Button
                size="sm"
                onClick={() => handleGenerate('week')}
              >
                Weekly Summary
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Generating {period}ly summary...</span>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}

        {summary && !isLoading && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="space-y-4">
              {/* Summary text */}
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-foreground leading-relaxed">{summary.summary}</p>
              </div>

              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-8">
                  <span className="text-xs text-muted-foreground">
                    {isExpanded ? 'Hide details' : 'Show highlights & recommendations'}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-4">
                {/* Highlights */}
                {summary.highlights.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Highlights
                    </h4>
                    <ul className="space-y-1.5">
                      {summary.highlights.map((highlight, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {summary.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      Recommendations
                    </h4>
                    <ul className="space-y-1.5">
                      {summary.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-amber-500 mt-1">→</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CollapsibleContent>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Generated {format(summary.generatedAt, 'h:mm a')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleGenerate(period)}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
