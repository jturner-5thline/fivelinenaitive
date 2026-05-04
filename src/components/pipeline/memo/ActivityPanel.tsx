import type { Deal24hDigest } from '@/hooks/useDeal24hDigest';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const PREVIEW_LIMIT = 200;

function stripHtml(input: string): string {
  if (!input) return '';
  // Remove tags, decode a few common entities, collapse whitespace.
  const noTags = input
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ParagraphBlock({
  heading,
  text,
}: {
  heading?: string;
  text: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const clean = stripHtml(text);
  const isLong = clean.length > PREVIEW_LIMIT;
  const shown = !isLong || expanded ? clean : `${clean.slice(0, PREVIEW_LIMIT).trimEnd()}…`;
  return (
    <div>
      {heading && (
        <div className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">
          {heading}
        </div>
      )}
      <p className="text-sm font-normal leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {shown}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-1 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? 'Show less ↑' : 'Read more ↓'}
        </button>
      )}
    </div>
  );
}

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

  const paragraphs = (digest?.prose || []).map(p => ({
    heading: p.heading,
    text: p.segments.map(s => s.text).join(''),
  })).filter(p => stripHtml(p.text).length > 0);

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        Activity · Last 24h
      </div>

      <div className="space-y-4 flex-1">
        {paragraphs.length === 0 ? (
          <p className="text-sm font-normal text-muted-foreground/70 italic">
            No recent notes
          </p>
        ) : (
          paragraphs.map((p, i) => (
            <ParagraphBlock key={i} heading={p.heading} text={p.text} />
          ))
        )}
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