import type { Deal24hDigest } from '@/hooks/useDeal24hDigest';
import { Badge } from '@/components/ui/badge';

interface ActivityPanelProps {
  digest: Deal24hDigest | undefined;
  isLoading: boolean;
}

export function ActivityPanel({ digest, isLoading }: ActivityPanelProps) {
  if (isLoading) {
    return (
      <div className="p-5 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        Activity · Last 24h
      </div>

      <div className="space-y-3 text-sm leading-relaxed text-foreground/90 flex-1">
        {digest?.prose.map((p, i) => (
          <div key={i}>
            {p.heading && (
              <div className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">
                {p.heading}
              </div>
            )}
            <p className="font-normal">
              {p.segments.map((s, j) =>
                s.bold ? (
                  <strong key={j} className="font-semibold text-foreground">
                    {s.text}
                  </strong>
                ) : (
                  <span key={j}>{s.text}</span>
                ),
              )}
            </p>
          </div>
        ))}
      </div>

      {digest?.tags && digest.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-border">
          {digest.tags.map((t, i) => {
            const isComplete = /complete|✓|issued|closed/i.test(t);
            const isPending = /pending|in progress/i.test(t);
            const variant = isComplete ? 'green' : isPending ? 'amber' : 'gray';
            return (
              <Badge key={i} variant={variant} className="text-[10px]">
                {t}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}