import { useEffect, useMemo, useRef, useState } from 'react';
import { Video, Search, Plus, ExternalLink, Unlink, Loader2, ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useClaapRecordings } from '@/hooks/useClaapRecordings';
import { useDealClaapRecordings } from '@/hooks/useDealClaapRecordings';
import { useClaapIntegration } from '@/hooks/useClaapIntegration';
import { format } from 'date-fns';

interface MeetingsSectionProps {
  dealId: string;
}

export function MeetingsSection({ dealId }: MeetingsSectionProps) {
  const { isEnabled } = useClaapIntegration();
  const { recordings, loading, fetchRecordings, getRecording } = useClaapRecordings();
  const { linkedRecordings, linkedRecordingIds, linkRecording, unlinkRecording } = useDealClaapRecordings(dealId);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);

  // On open: refetch fresh (bypass 60s live cache) so today's meetings show up.
  useEffect(() => {
    if (open && isEnabled) fetchRecordings('', { bypassLiveCache: true });
  }, [open, isEnabled, fetchRecordings]);

  // Debounced live re-search as the user types so recordings the local mirror
  // doesn't have yet still surface without requiring an Enter press.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !isEnabled) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchRecordings(search);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, open, isEnabled, fetchRecordings]);

  // Parse a Claap URL or bare ID. Claap share/watch URLs typically look like
  // `https://app.claap.io/…/UcJHxNIAwpa0` — the last path segment is the id.
  // NOTE: this useMemo MUST stay above any early return so hook order is
  // stable across renders (Rules of Hooks).
  const extractedId = useMemo(() => {
    const raw = pasteUrl.trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      // Claap ids are ~12 char alphanum tokens
      return /^[A-Za-z0-9_-]{8,32}$/.test(last) ? last : '';
    } catch {
      return /^[A-Za-z0-9_-]{8,32}$/.test(raw) ? raw : '';
    }
  }, [pasteUrl]);

  if (!isEnabled) return null;

  const available = recordings.filter(r => !linkedRecordingIds.includes(r.id));

  const handlePasteLink = async () => {
    if (!extractedId || pasteBusy) return;
    setPasteBusy(true);
    try {
      const rec = await getRecording(extractedId);
      if (rec) {
        await linkRecording(rec);
      } else {
        // Fall back to a minimal stub — enough to insert the link row so the
        // meeting appears on the deal even when Claap is rate-limited.
        await linkRecording({
          id: extractedId,
          title: 'Claap recording',
          createdAt: '',
          durationSeconds: 0,
          labels: [],
          recorder: { attended: false, email: '', id: '', name: '' },
          state: 'ready',
          thumbnailUrl: '',
          transcripts: [],
          url: pasteUrl.trim(),
        });
      }
      setPasteUrl('');
      setOpen(false);
    } finally {
      setPasteBusy(false);
    }
  };

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:bg-muted/40"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Video className="h-3 w-3" />
        Meetings
        {linkedRecordings.length > 0 && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{linkedRecordings.length}</Badge>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span
              role="button"
              className="ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
              onClick={(e) => { e.stopPropagation(); setOpen(true); }}
            >
              <Plus className="h-3 w-3" /> Add
            </span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0" onClick={(e) => e.stopPropagation()}>
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search Claap recordings…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') fetchRecordings(search); }}
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </div>
            <ScrollArea className="max-h-72">
              {loading && available.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : available.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No recordings found. Paste a Claap URL below to link directly.
                </p>
              ) : (
                <div className="py-1">
                  {available
                    .filter(r => !search || r.title?.toLowerCase().includes(search.toLowerCase()))
                    .map(r => (
                      <button
                        key={r.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 hover:bg-muted/60 flex items-start gap-2"
                        onClick={() => { linkRecording(r); setOpen(false); }}
                      >
                        <Video className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{r.title || 'Untitled recording'}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {r.createdAt ? format(new Date(r.createdAt), 'MMM d, yyyy') : ''}
                            {r.recorder?.name ? ` · ${r.recorder.name}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </ScrollArea>
            <div className="border-t p-2 space-y-1.5">
              <p className="text-[10px] text-muted-foreground">
                Can't find it? Paste the Claap URL:
              </p>
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <Link2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={pasteUrl}
                    onChange={e => setPasteUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && extractedId) handlePasteLink(); }}
                    placeholder="https://app.claap.io/…"
                    className="h-7 pl-7 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!extractedId || pasteBusy}
                  onClick={handlePasteLink}
                >
                  {pasteBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Link'}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </button>

      {expanded && (
        <div className="pb-1">
          {linkedRecordings.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
              No meetings linked yet.
            </p>
          ) : (
            linkedRecordings.map(r => (
              <div key={r.id} className="group px-3 py-1.5 flex items-start gap-2 hover:bg-muted/40">
                <Video className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  {r.recording_url ? (
                    <a
                      href={r.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium truncate block hover:underline"
                    >
                      {r.recording_title || 'Untitled recording'}
                    </a>
                  ) : (
                    <p className="text-xs font-medium truncate">{r.recording_title || 'Untitled recording'}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground truncate">
                    {r.linked_at ? format(new Date(r.linked_at), 'MMM d, yyyy') : ''}
                    {r.recorder_name ? ` · ${r.recorder_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                  {r.recording_url && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => window.open(r.recording_url!, '_blank')}
                      title="Open in Claap"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => unlinkRecording(r.recording_id)}
                    title="Unlink meeting"
                  >
                    <Unlink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}