import { useEffect, useMemo, useState } from 'react';
import {
  Video,
  Plus,
  Loader2,
  ExternalLink,
  Briefcase,
  Search,
  X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useClaapRecordings, type ClaapRecording } from '@/hooks/useClaapRecordings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface AffiliatedDeal {
  id: string;
  name: string;
}

export interface ManualClaapLink {
  id: string;
  title: string;
  url: string;
  recordedAt?: string | null;
  linkedDealIds: string[];
}

interface MeetingClaapLinkerProps {
  affiliatedDeals: AffiliatedDeal[];
  inlineExistingUrls: string[];
  manualLinks: ManualClaapLink[];
  onAddManualLink: (link: ManualClaapLink) => void;
  onRemoveManualLink: (recordingId: string) => void;
}

export function MeetingClaapLinker({
  affiliatedDeals,
  inlineExistingUrls,
  manualLinks,
  onAddManualLink,
  onRemoveManualLink,
}: MeetingClaapLinkerProps) {
  const { recordings, loading, fetchRecordings } = useClaapRecordings();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<ClaapRecording | null>(null);
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && recordings.length === 0 && !loading) {
      fetchRecordings();
    }
  }, [open, recordings.length, loading, fetchRecordings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? recordings.filter(
          (r) =>
            (r.title || '').toLowerCase().includes(q) ||
            (r.recorder?.name || '').toLowerCase().includes(q),
        )
      : recordings;
    return list.slice(0, 25);
  }, [recordings, search]);

  const persistLink = async (rec: ClaapRecording, dealIds: string[]) => {
    setSaving(true);
    try {
      if (dealIds.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const rows = dealIds.map((deal_id) => ({
          deal_id,
          recording_id: rec.id,
          recording_title: rec.title,
          recording_url: rec.url,
          thumbnail_url: rec.thumbnailUrl,
          duration_seconds: rec.durationSeconds,
          recorder_name: rec.recorder?.name,
          recorder_email: rec.recorder?.email,
          linked_by: user?.id,
        }));
        const { error } = await supabase
          .from('deal_claap_recordings')
          .upsert(rows, { onConflict: 'deal_id,recording_id', ignoreDuplicates: true });
        if (error) throw error;
      }
      onAddManualLink({
        id: rec.id,
        title: rec.title || 'Untitled recording',
        url: rec.url,
        recordedAt: rec.createdAt,
        linkedDealIds: dealIds,
      });
      toast.success(
        dealIds.length > 0
          ? `Linked to meeting and ${dealIds.length} deal${dealIds.length === 1 ? '' : 's'}`
          : 'Linked to meeting',
      );
      setPending(null);
      setSelectedDealIds([]);
      setOpen(false);
      setSearch('');
    } catch (err: any) {
      console.error('Failed to link Claap recording:', err);
      toast.error(err?.message || 'Failed to link recording');
    } finally {
      setSaving(false);
    }
  };

  const handlePick = (rec: ClaapRecording) => {
    if (affiliatedDeals.length <= 1) {
      const dealIds = affiliatedDeals.map((d) => d.id);
      void persistLink(rec, dealIds);
      return;
    }
    // Multiple candidate deals — let the user confirm
    setPending(rec);
    setSelectedDealIds(affiliatedDeals.map((d) => d.id));
  };

  const allDisplayed = useMemo(() => {
    const seen = new Set<string>();
    const items: { key: string; title: string; url: string; recordedAt?: string | null; dealIds?: string[] }[] = [];
    for (const link of manualLinks) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      items.push({
        key: `manual-${link.id}`,
        title: link.title,
        url: link.url,
        recordedAt: link.recordedAt,
        dealIds: link.linkedDealIds,
      });
    }
    for (const url of inlineExistingUrls) {
      if (seen.has(url)) continue;
      seen.add(url);
      items.push({ key: `inline-${url}`, title: url.replace(/^https?:\/\/(www\.)?/, ''), url });
    }
    return items;
  }, [manualLinks, inlineExistingUrls]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Video className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
            Linked Claap
          </span>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Link recording
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[320px] p-0 bg-background/95 backdrop-blur-xl border-white/10"
          >
            {pending ? (
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground truncate">
                    Choose affiliated deals
                  </p>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setPending(null);
                      setSelectedDealIds([]);
                    }}
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground/80 truncate">
                  {pending.title || 'Untitled recording'}
                </p>
                <div className="space-y-1 max-h-[180px] overflow-y-auto">
                  {affiliatedDeals.map((d) => {
                    const checked = selectedDealIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedDealIds((prev) =>
                              v ? [...prev, d.id] : prev.filter((id) => id !== d.id),
                            );
                          }}
                        />
                        <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-foreground truncate">{d.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setPending(null);
                      setSelectedDealIds([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={saving}
                    onClick={() => persistLink(pending, selectedDealIds)}
                  >
                    {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Link
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search recent recordings…"
                    className="h-8 pl-7 text-xs bg-white/[0.03]"
                  />
                </div>
                <ScrollArea className="max-h-[260px]">
                  {loading ? (
                    <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading recordings…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground/70 italic px-2 py-4 text-center">
                      {recordings.length === 0
                        ? 'No synced Claap recordings yet.'
                        : 'No recordings match your search.'}
                    </div>
                  ) : (
                    <ul className="space-y-0.5">
                      {filtered.map((r) => {
                        const when = (() => {
                          try {
                            return r.createdAt ? format(parseISO(r.createdAt), 'MMM d, yyyy') : '';
                          } catch {
                            return '';
                          }
                        })();
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => handlePick(r)}
                              className={cn(
                                'w-full text-left px-2 py-1.5 rounded-md hover:bg-white/[0.05]',
                                'flex flex-col gap-0.5',
                              )}
                            >
                              <span className="text-xs font-medium text-foreground truncate">
                                {r.title || 'Untitled recording'}
                              </span>
                              <span className="text-[10px] text-muted-foreground/70 truncate">
                                {when}
                                {r.recorder?.name ? ` · ${r.recorder.name}` : ''}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </ScrollArea>
                {affiliatedDeals.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/60 px-2 pt-2 border-t border-white/10">
                    No affiliated deal detected — link will apply to this meeting only.
                  </p>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {allDisplayed.length === 0 ? (
        <div className="text-[11px] text-muted-foreground/60 italic rounded-md border border-dashed border-white/10 px-3 py-2">
          No Claap recording linked to this meeting.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {allDisplayed.map((item) => (
            <li
              key={item.key}
              className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate min-w-0"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </a>
                {item.key.startsWith('manual-') && (
                  <button
                    type="button"
                    onClick={() => onRemoveManualLink(item.key.replace('manual-', ''))}
                    className="text-muted-foreground/60 hover:text-foreground shrink-0"
                    aria-label="Remove link"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {item.dealIds && item.dealIds.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {item.dealIds.map((id) => {
                    const d = affiliatedDeals.find((x) => x.id === id);
                    if (!d) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 bg-white/[0.04] rounded-full px-1.5 py-0.5"
                      >
                        <Briefcase className="h-2.5 w-2.5" />
                        {d.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}