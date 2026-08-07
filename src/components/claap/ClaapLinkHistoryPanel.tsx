import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, History, Link2, Unlink, Sparkles, CheckCircle2, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { useClaapLinkHistory } from '@/hooks/useClaapFundingSourceLinks';
import { cn } from '@/lib/utils';

const EVENT_META: Record<string, { label: string; icon: typeof Link2; tone: string }> = {
  auto_matched: { label: 'Auto-matched', icon: Sparkles, tone: 'text-sky-300' },
  manual_linked: { label: 'Manually linked', icon: Link2, tone: 'text-emerald-300' },
  confirmed: { label: 'Match confirmed', icon: CheckCircle2, tone: 'text-emerald-300' },
  relinked: { label: 'Relinked', icon: Link2, tone: 'text-emerald-300' },
  unlinked: { label: 'Unlinked', icon: Unlink, tone: 'text-destructive' },
  status_changed: { label: 'Status changed', icon: History, tone: 'text-muted-foreground' },
};

interface Props {
  /** Scope to a single recording. */
  recordingId?: string | null;
  /** Scope to every recording linked to this funding source. */
  entityId?: string | null;
  /** Show the recording title on each row (funding-source scope). */
  showRecordingTitle?: boolean;
  className?: string;
}

export function ClaapLinkHistoryPanel({ recordingId, entityId, showRecordingTitle, className }: Props) {
  const { data: events = [], isLoading } = useClaapLinkHistory({ recordingId, entityId });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const meta = EVENT_META[e.event_type] || EVENT_META.status_changed;
      return [
        e.recordingTitle,
        e.recording_id,
        e.entityName,
        e.reason,
        e.actorName,
        meta.label,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [events, search]);

  if (!recordingId && !entityId) return null;

  return (
    <div className={cn('rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2.5', className)}>
      <div className="flex items-center gap-1.5">
        <History className="h-3 w-3 text-sky-300/80" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          Link history
        </span>
        {events.length > 0 && (
          <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">
            {search.trim() ? `${filtered.length}/${events.length}` : events.length}
          </Badge>
        )}
      </div>

      {events.length > 3 && (
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, recording ID, source…"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <Loader2 className="mt-2 h-3 w-3 animate-spin text-muted-foreground" />
      ) : events.length === 0 ? (
        <p className="mt-1 text-xs italic text-muted-foreground">No link activity recorded yet.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-1 text-xs italic text-muted-foreground">No events match “{search}”.</p>
      ) : (
        <ScrollArea className="mt-1.5 max-h-56">
          <ol className="space-y-2 pr-2">
            {filtered.map((e) => {
              const meta = EVENT_META[e.event_type] || EVENT_META.status_changed;
              const Icon = meta.icon;
              return (
                <li key={e.id} className="flex gap-2">
                  <Icon className={cn('mt-0.5 h-3 w-3 shrink-0', meta.tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-medium">{meta.label}</span>
                      {e.entityName && !entityId && (
                        <span className="text-muted-foreground">· {e.entityName}</span>
                      )}
                      {showRecordingTitle && e.recordingTitle && (
                        <span className="truncate text-muted-foreground">· {e.recordingTitle}</span>
                      )}
                      {e.source && e.event_type === 'auto_matched' && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px]">
                          {(e.confidence ?? 0) >= 0.9 ? 'Domain match' : 'Title match'}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(e.created_at), 'MMM d, yyyy h:mm a')}
                      {e.actorName ? ` · ${e.actorName}` : ' · System'}
                    </div>
                    {e.reason && (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground">“{e.reason}”</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      )}
    </div>
  );
}
