import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useClaapMapping, type ClaapCandidate, type ClaapEntityType, type ClaapLinkRole } from '@/hooks/useClaapMapping';
import { Check, X, Sparkles, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  recordingId: string;
  className?: string;
}

const SECTIONS: Array<{ type: ClaapEntityType; label: string; role: ClaapLinkRole }> = [
  { type: 'meeting', label: 'Meeting', role: 'primary_meeting' },
  { type: 'contact', label: 'Attendee contacts', role: 'attendee_contact' },
  { type: 'company', label: 'Company', role: 'primary_company' },
  { type: 'deal', label: 'Deal', role: 'primary_deal' },
];

function sourceLabel(source: string) {
  if (source === 'auto') return 'Auto-linked';
  if (source === 'eod') return 'Suggested (EOD)';
  if (source === 'manual') return 'Manual';
  return 'Suggested';
}

function bandClass(score: number) {
  if (score >= 0.9) return 'text-emerald-400';
  if (score >= 0.65) return 'text-amber-400';
  return 'text-muted-foreground';
}

/**
 * Mapping panel — embedded on the Claap recording detail page.
 * Shows scored candidates per entity type with reasons, plus inline accept/reject.
 */
export function ClaapMappingPanel({ recordingId, className }: Props) {
  const { candidates, links, isLoading, accept, reject, markUnrelated } = useClaapMapping(recordingId);

  const grouped = useMemo(() => {
    const m = new Map<ClaapEntityType, ClaapCandidate[]>();
    for (const c of candidates) {
      const arr = m.get(c.entity_type) || [];
      arr.push(c);
      m.set(c.entity_type, arr);
    }
    return m;
  }, [candidates]);

  const linkByEntity = useMemo(() => {
    const m = new Map<string, typeof links[number]>();
    for (const l of links) m.set(`${l.entity_type}:${l.entity_id}`, l);
    return m;
  }, [links]);

  const highConfidencePending = candidates.filter(
    c => c.score >= 0.9 && !linkByEntity.has(`${c.entity_type}:${c.entity_id}`),
  );

  return (
    <Card className={cn('p-4 space-y-4 bg-card/50', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Mapping</h3>
        </div>
        {highConfidencePending.length > 0 && (
          <Button
            size="sm"
            onClick={() => highConfidencePending.forEach(c => {
              const role = SECTIONS.find(s => s.type === c.entity_type)?.role;
              if (role) accept.mutate({ candidateId: c.id, linkRole: role });
            })}
          >
            Accept {highConfidencePending.length} high-confidence
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : (
        SECTIONS.map(section => {
          const items = (grouped.get(section.type) || []).slice(0, 5);
          const sectionLinks = links.filter(l => l.entity_type === section.type);
          return (
            <div key={section.type} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </div>
                {items.length > 0 && (
                  <button
                    onClick={() => markUnrelated.mutate(section.type)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Mark all unrelated
                  </button>
                )}
              </div>

              {sectionLinks.map(l => (
                <div key={l.id} className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Link2 className="h-3 w-3 text-emerald-400" />
                    <span className="font-mono text-[10px] text-muted-foreground">{l.entity_id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[10px]">{sourceLabel(l.source)}</Badge>
                  </div>
                  <div className={cn('text-xs font-medium', bandClass(l.confidence ?? 0))}>
                    {Math.round((l.confidence ?? 0) * 100)}%
                  </div>
                </div>
              ))}

              {items.length === 0 && sectionLinks.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No candidates</div>
              )}

              {items.map(c => {
                const linked = linkByEntity.has(`${c.entity_type}:${c.entity_id}`);
                if (linked) return null;
                return (
                  <div key={c.id} className="rounded-md border border-border bg-background/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-[10px] text-muted-foreground">{c.entity_id.slice(0, 8)}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {c.run_type === 'end_of_day' ? 'Suggested (EOD)' : 'Suggested (post-call)'}
                        </Badge>
                      </div>
                      <div className={cn('text-sm font-semibold', bandClass(c.score))}>
                        {Math.round(c.score * 100)}%
                      </div>
                    </div>
                    {c.reasons.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground space-y-0.5">
                        {c.reasons.slice(0, 3).map((r, i) => (
                          <li key={i}>• {r.label}</li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => accept.mutate({ candidateId: c.id, linkRole: section.role })}
                      >
                        <Check className="h-3 w-3 mr-1" /> Accept
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => reject.mutate({ candidateId: c.id })}
                      >
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </Card>
  );
}