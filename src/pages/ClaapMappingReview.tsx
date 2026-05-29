import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useClaapReviewQueue } from '@/hooks/useClaapMapping';
import { ClaapMappingPanel } from '@/components/claap/ClaapMappingPanel';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Global Claap mapping review queue.
 * Lists recordings with pending suggestions; expand to reveal the per-recording
 * Mapping panel with full per-entity scoring + accept/reject actions.
 */
export default function ClaapMappingReview() {
  const { data: rows = [], isLoading } = useClaapReviewQueue();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Claap Mapping Review</h1>
        <p className="text-sm text-muted-foreground">
          Recordings with pending entity-resolution suggestions. Accept high-confidence
          matches or reject incorrect ones; the engine re-scores nightly.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No recordings need review right now.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const open = expanded === r.id;
            return (
              <Card key={r.id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : r.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium truncate">{r.title || 'Untitled recording'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.organizer_email || '—'}
                        {r.started_at ? ` · ${new Date(r.started_at).toLocaleString()}` : ''}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                </button>
                {open && (
                  <div className="border-t border-border p-4 bg-background/30">
                    <ClaapMappingPanel recordingId={r.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}