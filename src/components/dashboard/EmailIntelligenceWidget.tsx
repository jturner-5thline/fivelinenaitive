import { Mail, Tag, ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';

interface SmartSuggestion {
  id: string;
  type: 'label' | 'response' | 'context';
  title: string;
  description: string;
  actionLabel: string;
}

const SMART_SUGGESTIONS: SmartSuggestion[] = [
  {
    id: '1',
    type: 'response',
    title: 'Lango follow-up detected',
    description: 'Email from Lango Capital RE: Term Sheet Review — likely needs a response within 24h.',
    actionLabel: 'View email',
  },
  {
    id: '2',
    type: 'label',
    title: 'Auto-label suggestion: Active Deal',
    description: '"Decathlon Capital" thread matches your Active Deals label pattern. Apply automatically?',
    actionLabel: 'Apply label',
  },
  {
    id: '3',
    type: 'context',
    title: 'Newsletter from SaaS Capital',
    description: 'Market update from SaaS Capital — contains rate change data relevant to 2 active deals.',
    actionLabel: 'View insights',
  },
];

export function EmailIntelligenceWidget() {
  const { toggles } = useDashboardLayout();

  if (toggles.hideEmailHints) return null;

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Email Intelligence
          <Badge variant="outline" className="text-[10px]">Preview</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {SMART_SUGGESTIONS.map(suggestion => (
          <div
            key={suggestion.id}
            className="flex items-start gap-3 p-2.5 rounded-lg bg-background/50 border group"
          >
            <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
              {suggestion.type === 'label' ? <Tag className="h-3.5 w-3.5 text-primary" /> :
               suggestion.type === 'response' ? <Mail className="h-3.5 w-3.5 text-primary" /> :
               <Sparkles className="h-3.5 w-3.5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{suggestion.description}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity gap-1">
              {suggestion.actionLabel}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
