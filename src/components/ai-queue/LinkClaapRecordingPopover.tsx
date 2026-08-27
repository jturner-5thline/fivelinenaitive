/**
 * LinkClaapRecordingPopover — manual Claap linking for Approval Queue items.
 *
 * When the auto-matcher can't tie a queue item to a Claap recording ("No Claap
 * recording matched yet"), the user can search the local Claap mirror
 * (claap_meetings + claap_recordings) by title and link one by hand. The chosen
 * recording is written back onto `ai_action_queue.source` so every downstream
 * consumer (draft-deal-from-claap, the card header) sees the match.
 */
import { useMemo, useState } from 'react';
import { Video, Search, Loader2, Link2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClaapMatchCandidate {
  key: string;
  kind: 'meeting' | 'recording';
  id: string;
  title: string;
  when: string | null;
  url: string | null;
}

interface Props {
  /** Prefills the search box (usually the calendar event / company name). */
  defaultQuery?: string;
  label?: string;
  onLink: (candidate: ClaapMatchCandidate) => Promise<void> | void;
}

function fmt(when: string | null): string {
  if (!when) return '';
  try {
    return format(parseISO(when), 'MMM d, yyyy');
  } catch {
    return '';
  }
}

export function LinkClaapRecordingPopover({ defaultQuery = '', label = 'Link Claap recording', onLink }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(defaultQuery);
  const [linking, setLinking] = useState<string | null>(null);

  const term = search.trim();

  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ['claap-manual-match', term],
    enabled: open,
    staleTime: 30_000,
    queryFn: async (): Promise<ClaapMatchCandidate[]> => {
      const like = `%${term}%`;
      const meetingsQ = supabase
        .from('claap_meetings')
        .select('id, title, started_at, recording_url')
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(20);
      const recsQ = supabase
        .from('claap_recordings')
        .select('id, title, started_at, recording_url')
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(20);
      const [m, r] = await Promise.all([
        term ? meetingsQ.ilike('title', like) : meetingsQ,
        term ? recsQ.ilike('title', like) : recsQ,
      ]);
      const out: ClaapMatchCandidate[] = [];
      const seen = new Set<string>();
      for (const row of m.data ?? []) {
        const title = (row.title as string) || 'Untitled recording';
        seen.add(title.toLowerCase());
        out.push({
          key: `meeting-${row.id}`,
          kind: 'meeting',
          id: row.id as string,
          title,
          when: (row.started_at as string) ?? null,
          url: (row.recording_url as string) ?? null,
        });
      }
      for (const row of r.data ?? []) {
        const title = (row.title as string) || 'Untitled recording';
        if (seen.has(title.toLowerCase())) continue;
        out.push({
          key: `recording-${row.id}`,
          kind: 'recording',
          id: row.id as string,
          title,
          when: (row.started_at as string) ?? null,
          url: (row.recording_url as string) ?? null,
        });
      }
      return out.slice(0, 30);
    },
  });

  const empty = useMemo(() => !isFetching && candidates.length === 0, [isFetching, candidates.length]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[340px] p-2 z-[1400]">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Claap recordings…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <ScrollArea className="max-h-[280px]">
          {isFetching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : empty ? (
            <p className="px-2 py-4 text-center text-[11px] italic text-muted-foreground/70">
              No Claap recordings match that search.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {candidates.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    disabled={!!linking}
                    onClick={async () => {
                      setLinking(c.key);
                      try {
                        await onLink(c);
                        setOpen(false);
                      } catch (e: any) {
                        toast.error(e?.message || 'Could not link that recording');
                      } finally {
                        setLinking(null);
                      }
                    }}
                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.05] disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                      {linking === c.key ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                      ) : (
                        <Video className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{c.title}</span>
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground/70">{fmt(c.when)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
