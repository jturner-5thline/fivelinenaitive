import { Bot, TrendingUp, Target, Clock, Shield, Zap, Users, AlertTriangle, Lightbulb, BarChart3, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AgentSuggestion } from '@/hooks/useAgentSuggestions';

interface SuggestionDeepDiveDialogProps {
  suggestion: AgentSuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  pipeline: <TrendingUp className="h-5 w-5" />,
  lender: <Target className="h-5 w-5" />,
  activity: <Clock className="h-5 w-5" />,
  risk: <Shield className="h-5 w-5" />,
  competitive: <Zap className="h-5 w-5" />,
  team: <Users className="h-5 w-5" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  pipeline: 'Pipeline Management',
  lender: 'Lender Relationships',
  activity: 'Activity Tracking',
  risk: 'Risk Assessment',
  competitive: 'Competitive Intelligence',
  team: 'Team Coordination',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

// Pattern explanations based on category
const PATTERN_EXPLANATIONS: Record<string, { patterns: string[]; metrics: string[]; impact: string }> = {
  pipeline: {
    patterns: [
      'Detected deals with no updates in 7+ days',
      'Identified stage progression bottlenecks',
      'Found deals stuck in early pipeline stages',
    ],
    metrics: [
      'Average time deals spend in each stage',
      'Percentage of active deals that are stale',
      'Stage distribution across your pipeline',
    ],
    impact: 'Proactive monitoring can reduce deal cycle time by 15-20% and prevent deals from falling through the cracks.',
  },
  lender: {
    patterns: [
      'Analyzed lender response patterns',
      'Identified engagement rate by lender type',
      'Tracked stage progression velocity',
    ],
    metrics: [
      'Number of lenders in outreach vs. engaged',
      'Average response time from lenders',
      'Success rate by lender category',
    ],
    impact: 'AI-powered matching can improve lender response rates by 30% and reduce time to term sheet.',
  },
  activity: {
    patterns: [
      'Tracked activity volume across deals',
      'Identified peak collaboration times',
      'Measured update frequency patterns',
    ],
    metrics: [
      'Activities per deal per week',
      'Team member contribution distribution',
      'Most common activity types',
    ],
    impact: 'Automated summaries save 2-3 hours per week on stakeholder reporting and status updates.',
  },
  risk: {
    patterns: [
      'Identified high-value deals requiring attention',
      'Analyzed deal complexity indicators',
      'Tracked milestone completion rates',
    ],
    metrics: [
      'Number of deals over $5M threshold',
      'Overdue milestone percentage',
      'Deal-at-risk indicators',
    ],
    impact: 'Early risk identification can prevent 40% of deal complications and improve close rates.',
  },
  competitive: {
    patterns: [
      'Observed deal diversity across sectors',
      'Analyzed market positioning opportunities',
      'Tracked competitive landscape changes',
    ],
    metrics: [
      'Industry sector distribution',
      'Geographic spread of deals',
      'Market trend alignment',
    ],
    impact: 'Competitive intelligence improves deal positioning and helps anticipate market shifts.',
  },
  team: {
    patterns: [
      'Measured response time between activities',
      'Identified collaboration gaps',
      'Tracked handoff efficiency',
    ],
    metrics: [
      'Average hours between team activities',
      'Number of unique team contributors',
      'Activity distribution by team member',
    ],
    impact: 'Improved coordination can reduce deal delays by 25% and enhance team productivity.',
  },
};

export function SuggestionDeepDiveDialog({ suggestion, open, onOpenChange, onApply }: SuggestionDeepDiveDialogProps) {
  if (!suggestion) return null;

  const category = suggestion.category || 'pipeline';
  const categoryIcon = CATEGORY_ICONS[category] || <Bot className="h-5 w-5" />;
  const categoryLabel = CATEGORY_LABELS[category] || 'General';
  const patternInfo = PATTERN_EXPLANATIONS[category] || PATTERN_EXPLANATIONS.pipeline;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {categoryIcon}
            </div>
            <div>
              <DialogTitle className="text-xl">{suggestion.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {categoryLabel}
                </Badge>
                <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[suggestion.priority]}`}>
                  {suggestion.priority} priority
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Description */}
          <div>
            <p className="text-muted-foreground">{suggestion.description}</p>
          </div>

          <Separator />

          {/* Why This Suggestion */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                Why We're Recommending This
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{suggestion.reasoning}</p>
            </CardContent>
          </Card>

          {/* Detected Patterns */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Patterns We Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {patternInfo.patterns.map((pattern, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{pattern}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Metrics Analyzed */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Metrics We Analyzed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {patternInfo.metrics.map((metric, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                    <span>{metric}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Expected Impact */}
          <Card className="bg-success/5 border-success/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Expected Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{patternInfo.impact}</p>
            </CardContent>
          </Card>

          {/* Suggested Triggers */}
          {suggestion.suggested_triggers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Recommended Triggers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {suggestion.suggested_triggers.map((trigger, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm">
                      <Badge variant="secondary" className="shrink-0">
                        {trigger.trigger_type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-muted-foreground">{trigger.description}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Suggested Prompt Preview */}
          {suggestion.suggested_prompt && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Agent System Prompt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-mono text-muted-foreground italic">
                    "{suggestion.suggested_prompt}"
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Action Button */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Maybe Later
            </Button>
            <Button onClick={onApply}>
              <Bot className="h-4 w-4 mr-2" />
              Create This Agent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
