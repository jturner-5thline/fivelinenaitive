import { X, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAiDealFilterStore } from '@/stores/aiDealFilterStore';

/**
 * Inline banner showing AI-applied filters above the deal grid.
 * Each chip is individually removable; "Clear AI" wipes them all.
 */
export function AIFilterChips() {
  const rules = useAiDealFilterStore((s) => s.rules);
  const summary = useAiDealFilterStore((s) => s.summary);
  const isTranslating = useAiDealFilterStore((s) => s.isTranslating);
  const clarification = useAiDealFilterStore((s) => s.lastClarification);
  const removeRule = useAiDealFilterStore((s) => s.removeRule);
  const clear = useAiDealFilterStore((s) => s.clear);

  if (!isTranslating && rules.length === 0 && !clarification) return null;

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 text-primary font-medium">
        {isTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        AI Filter
      </span>
      {summary && rules.length > 0 && (
        <span className="text-muted-foreground truncate max-w-[42ch]">{summary}</span>
      )}
      {clarification && rules.length === 0 && (
        <span className="text-muted-foreground italic">{clarification}</span>
      )}
      {rules.map((rule) => (
        <Badge key={rule.id} variant="secondary" className="gap-1 pr-1 bg-background/70">
          {rule.label}
          <button
            onClick={() => removeRule(rule.id)}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
            aria-label={`Remove ${rule.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {rules.length > 0 && (
        <Button variant="ghost" size="sm" onClick={clear} className="ml-auto h-7 px-2 text-xs gap-1">
          <X className="h-3 w-3" /> Clear AI filters
        </Button>
      )}
    </div>
  );
}