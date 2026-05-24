import { Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Presentational radio-card list rendered above the inline reply
 * composer body. The cards are populated by the Draft Reply flow
 * (`generate_draft_options` via AiAssistSidebar) — this component is
 * pure: no network, no shared state.
 *
 * Selecting a card calls `onSelect(id)`; the parent decides what to do
 * with the chosen body (typically: populate the composer textarea).
 */

export interface SuggestedReply {
  id: string;
  toneKey: 'concise' | 'balanced';
  label: string;
  body: string;
  loading?: boolean;
}

interface Props {
  suggestions: SuggestedReply[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRegenerate?: () => void;
  className?: string;
}

export function SuggestedReplyCards({
  suggestions,
  selectedId,
  onSelect,
  onRegenerate,
  className,
}: Props) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div
      data-testid="suggested-reply-cards"
      role="radiogroup"
      aria-label="Suggested replies"
      className={cn(
        'flex flex-col gap-2 border-b border-[hsl(var(--email-border))] px-4 py-3 bg-muted/20',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          AI suggested replies
        </span>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Regenerate suggestions"
          >
            <RefreshCw className="h-3 w-3" /> Regenerate
          </button>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {suggestions.map((s) => {
          const isSelected = selectedId === s.id;
          const preview = (s.body || '').replace(/\s+/g, ' ').slice(0, 160);
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={s.label}
              disabled={s.loading || !s.body}
              onClick={() => onSelect(s.id)}
              className={cn(
                'text-left rounded-md border px-3 py-2 transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-[hsl(var(--email-border))] hover:border-primary/40 hover:bg-card/60',
                s.loading && 'opacity-60 cursor-wait',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-block h-3 w-3 rounded-full border',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                  )}
                  aria-hidden
                />
                <span className="text-xs font-semibold text-foreground">{s.label}</span>
                {s.loading && (
                  <span className="ml-auto text-[10px] text-muted-foreground">Generating…</span>
                )}
              </div>
              {preview && (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                  {preview}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}