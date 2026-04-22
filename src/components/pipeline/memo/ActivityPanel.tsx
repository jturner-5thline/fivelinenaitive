import type { Deal24hDigest } from '@/hooks/useDeal24hDigest';

interface ActivityPanelProps {
  digest: Deal24hDigest | undefined;
  isLoading: boolean;
}

export function ActivityPanel({ digest, isLoading }: ActivityPanelProps) {
  if (isLoading) {
    return (
      <div className="p-5 space-y-2">
        <div className="h-3 w-1/3 rounded bg-white/45 animate-pulse" />
        <div className="h-3 w-full rounded bg-white/40 animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-white/40 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-white/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a9aaa] mb-3">
        Activity · Last 24h
      </div>

      <div className="space-y-3 text-[13px] leading-[1.55] text-[#1a2b38] flex-1">
        {digest?.prose.map((p, i) => (
          <div key={i}>
            {p.heading && (
              <div className="text-[11px] font-semibold text-[#1e8b8b] uppercase tracking-wider mb-1">
                {p.heading}
              </div>
            )}
            <p className="font-light">
              {p.segments.map((s, j) =>
                s.bold ? (
                  <strong key={j} className="font-semibold text-[#1a2b38]">
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
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/45">
          {digest.tags.map((t, i) => {
            const isComplete = /complete|✓|issued|closed/i.test(t);
            const isPending = /pending|in progress/i.test(t);
            return (
              <span
                key={i}
                className={
                  isComplete
                    ? 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#1a7a52]/10 text-[#1a7a52] border border-[#1a7a52]/20'
                    : isPending
                      ? 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#9a6800]/10 text-[#9a6800] border border-[#9a6800]/20'
                      : 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/55 text-[#4a6070] border border-white/70'
                }
              >
                {t}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}