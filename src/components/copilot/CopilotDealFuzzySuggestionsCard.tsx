import { useState } from 'react';
import { Check, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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

export function CopilotDealFuzzySuggestionsCard({ action }: Props) {
  const matches = action.params?.matches ?? [];
  const query = action.params?.query?.trim() || 'that deal';
  const latency = action.params?.latency_ms;
  const confidence = action.params?.confidence;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!matches.length) return null;

  const selectMatch = (match: DealMatch) => {
    if (selectedId) return; // prevent double-fire
    setSelectedId(match.id);
    const label = match.company.replace(/"/g, '\\"');
    const prompt = `Use the deal "${label}" (id: ${match.id}). Resolve the disambiguation with this choice and continue.`;
    window.dispatchEvent(new CustomEvent('copilot-chip-click', { detail: { prompt } }));
    window.dispatchEvent(new CustomEvent('copilot-disambiguation-resolved', { detail: { deal_id: match.id } }));
  };

  return (
    <Card className="my-2 border-border/70 bg-card/80">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold">I found similar deals for “{query}”</div>
            <div className="text-xs text-muted-foreground">
              Pick one of these matches to continue.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {typeof confidence === 'number' && (
              <Badge variant="outline" className="text-[10px]">
                {(confidence * 100).toFixed(0)}% top score
              </Badge>
            )}
            {typeof latency === 'number' && (
              <Badge variant="outline" className="text-[10px]">
                {latency}ms
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          {matches.map((match) => {
            const isSelected = selectedId === match.id;
            const isDisabled = !!selectedId && !isSelected;
            return (
              <div
                key={match.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors',
                  isSelected
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border/60 bg-background/40 hover:bg-background/70',
                  isDisabled && 'opacity-50',
                )}
              >
                <button
                  type="button"
                  onClick={() => selectMatch(match)}
                  disabled={!!selectedId}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                  data-testid={`fuzzy-match-${match.id}`}
                >
                  <div className="truncate text-sm font-medium">{match.company}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Stage: {match.stage || '—'}</span>
                    <span>Status: {match.status || '—'}</span>
                    <span>Value: {formatValue(match.value)}</span>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {typeof match.similarity === 'number' && (
                    <Badge variant="outline" className="text-[10px]">
                      {(match.similarity * 100).toFixed(0)}%
                    </Badge>
                  )}
                  <button
                    type="button"
                    aria-label={isSelected ? 'Selected' : `Select ${match.company}`}
                    aria-pressed={isSelected}
                    onClick={() => selectMatch(match)}
                    disabled={!!selectedId}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-background/40 text-muted-foreground hover:bg-background/70',
                      isDisabled && 'cursor-not-allowed',
                    )}
                    data-testid={`fuzzy-check-${match.id}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!!selectedId}
          onClick={() => dispatchPrompt(`No, none of these deals match \"${query}\".`)}
        >
          <SearchX className="h-3.5 w-3.5" />
          None of these
        </Button>
      </CardContent>
    </Card>
  );
}