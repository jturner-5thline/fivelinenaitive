import { Check, List, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DealMatch {
  id: string;
  company: string;
  value?: number | null;
  stage?: string | null;
  status?: string | null;
  similarity?: number | null;
}

interface Props {
  action: {
    description?: string;
    params?: {
      query?: string;
      confidence?: number | null;
      latency_ms?: number | null;
      top_match?: DealMatch | null;
      matches?: DealMatch[];
    };
  };
}

function formatValue(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}MM`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString()}K`;
  return `$${value.toLocaleString()}`;
}

function dispatchPrompt(prompt: string) {
  window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt } }));
}

export function CopilotDealFuzzyConfirmCard({ action }: Props) {
  const top = action.params?.top_match;
  const matches = action.params?.matches ?? [];
  const query = action.params?.query?.trim() || top?.company || 'that deal';
  const latency = action.params?.latency_ms;
  const confidence = action.params?.confidence;

  if (!top) return null;

  return (
    <Card className="my-2 border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Did you mean {top.company}?</div>
            <div className="text-xs text-muted-foreground">
              I found a similar deal for “{query}”.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {typeof confidence === 'number' && (
              <Badge variant="outline" className="text-[10px]">
                {(confidence * 100).toFixed(0)}% match
              </Badge>
            )}
            {typeof latency === 'number' && (
              <Badge variant="outline" className="text-[10px]">
                {latency}ms
              </Badge>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-background/40 p-3 text-sm">
          <div className="font-medium">{top.company}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Stage: {top.stage || '—'}</span>
            <span>Status: {top.status || '—'}</span>
            <span>Value: {formatValue(top.value)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => dispatchPrompt(`Yes — use the deal \"${top.company}\".`)}
          >
            <Check className="h-3.5 w-3.5" />
            Yes
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => dispatchPrompt(`Show other matches for \"${query}\".`)}
          >
            <List className="h-3.5 w-3.5" />
            Show other matches
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => dispatchPrompt(`No, none of these — I meant a different deal than \"${top.company}\".`)}
          >
            <X className="h-3.5 w-3.5" />
            No
          </Button>
        </div>

        {matches.length > 1 && (
          <div className="text-xs text-muted-foreground">
            {matches.length - 1} other possible match{matches.length - 1 === 1 ? '' : 'es'} available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}