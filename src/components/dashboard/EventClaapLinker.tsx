import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Video,
  Search,
  Loader2,
  ExternalLink,
  Briefcase,
  Building2,
  User,
  X,
  Check,
  Trash2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { useClaapRecordings, type ClaapRecording } from '@/hooks/useClaapRecordings';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface RankedEntry { score: number; reasons: Array<{ code: string; label: string; weight: number }>; }

export interface EventClaapLinkerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  attendeeEmails: string[];
  /** Deal already associated with the event (e.g. via activity log) */
  suggestedDealId?: string | null;
}

interface DealOption { id: string; name: string; company: string }
interface CompanyOption { id: string; name: string; domain: string | null }
interface ContactOption { id: string; full_name: string | null; email: string | null; crm_company_id?: string | null }

interface ExistingLink {
  id: string;
  recording_id: string;
  recording_title: string | null;
  recording_url: string | null;
  thumbnail_url: string | null;
  recorder_name: string | null;
  recorded_at: string | null;
  deal_ids: string[];
  company_ids: string[];
  contact_ids: string[];
  notes: string | null;
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

export function EventClaapLinker({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  attendeeEmails,
  suggestedDealId,
}: EventClaapLinkerProps) {
  const { company } = useCompany();
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const qc = useQueryClient();
  const { recordings, loading: loadingRecordings, fetchRecordings } = useClaapRecordings();

  const [search, setSearch] = useState('');
  const [selectedRecording, setSelectedRecording] = useState<ClaapRecording | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [entitySearch, setEntitySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [rankedMap, setRankedMap] = useState<Record<string, RankedEntry>>({});
  const [ranking, setRanking] = useState(false);
  const [autoPreselected, setAutoPreselected] = useState(false);

  const externalDomains = useMemo(() => {
    const set = new Set<string>();
    attendeeEmails.forEach(e => {
      const d = emailDomain(e);
      if (d) set.add(d);
    });
    return Array.from(set);
  }, [attendeeEmails]);

  // Fetch existing links for this event
  const { data: existingLinks = [], refetch: refetchLinks } = useQuery<ExistingLink[]>({
    queryKey: ['event-claap-links', eventId, company?.id],
    enabled: !!company?.id && !!eventId && open,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('event_claap_recordings') as any)
        .select('*')
        .eq('org_company_id', company!.id)
        .eq('event_id', eventId)
        .order('linked_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ExistingLink[];
    },
  });

  // Suggested companies (by attendee domain) and contacts (by attendee email)
  const { data: suggestedCompanies = [] } = useQuery<CompanyOption[]>({
    queryKey: ['eod-claap-suggest-companies', company?.id, externalDomains.sort().join(',')],
    enabled: !!company?.id && externalDomains.length > 0 && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_companies')
        .select('id, name, domain')
        .eq('org_company_id', company!.id)
        .in('domain', externalDomains);
      return (data || []) as CompanyOption[];
    },
  });

  const { data: suggestedContacts = [] } = useQuery<ContactOption[]>({
    queryKey: ['eod-claap-suggest-contacts', company?.id, attendeeEmails.sort().join(',')],
    enabled: !!company?.id && attendeeEmails.length > 0 && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, crm_company_id')
        .eq('org_company_id', company!.id)
        .in('email', attendeeEmails);
      return (data || []) as ContactOption[];
    },
  });

  // Search results for entity picker
  const { data: companyResults = [] } = useQuery<CompanyOption[]>({
    queryKey: ['eod-claap-search-companies', company?.id, entitySearch],
    enabled: !!company?.id && entitySearch.trim().length >= 2,
    queryFn: async () => {
      const q = entitySearch.trim();
      const { data } = await supabase
        .from('crm_companies')
        .select('id, name, domain')
        .eq('org_company_id', company!.id)
        .or(`name.ilike.%${q}%,domain.ilike.%${q}%`)
        .limit(15);
      return (data || []) as CompanyOption[];
    },
  });
  const { data: contactResults = [] } = useQuery<ContactOption[]>({
    queryKey: ['eod-claap-search-contacts', company?.id, entitySearch],
    enabled: !!company?.id && entitySearch.trim().length >= 2,
    queryFn: async () => {
      const q = entitySearch.trim();
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, crm_company_id')
        .eq('org_company_id', company!.id)
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(15);
      return (data || []) as ContactOption[];
    },
  });

  // Suggested deals based on attendee domain match against deals' companies
  const suggestedDeals = useMemo<DealOption[]>(() => {
    const out: DealOption[] = [];
    const seen = new Set<string>();
    if (suggestedDealId) {
      const d = deals.find(x => x.id === suggestedDealId);
      if (d) { out.push({ id: d.id, name: d.name, company: d.company }); seen.add(d.id); }
    }
    const domains = externalDomains;
    if (domains.length) {
      for (const d of deals) {
        if (seen.has(d.id)) continue;
        const hay = `${d.company || ''} ${d.name || ''}`.toLowerCase();
        for (const dom of domains) {
          const root = dom.split('.')[0];
          if (root && root.length > 2 && hay.includes(root)) {
            out.push({ id: d.id, name: d.name, company: d.company });
            seen.add(d.id);
            break;
          }
        }
        if (out.length >= 6) break;
      }
    }
    return out;
  }, [deals, suggestedDealId, externalDomains]);

  const dealSearchResults = useMemo<DealOption[]>(() => {
    const q = entitySearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return deals
      .filter(d => d.name?.toLowerCase().includes(q) || d.company?.toLowerCase().includes(q))
      .slice(0, 15)
      .map(d => ({ id: d.id, name: d.name, company: d.company }));
  }, [deals, entitySearch]);

  // Auto-fetch recordings on open
  useEffect(() => {
    if (!open || recordings.length > 0 || loadingRecordings) return;
    let cancelled = false;
    (async () => {
      await fetchRecordings(undefined, { live: false });
      if (!cancelled) void fetchRecordings(undefined, { live: true });
    })();
    return () => { cancelled = true; };
  }, [open, recordings.length, loadingRecordings, fetchRecordings]);

  // Reset internal state on open/close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedRecording(null);
      setEditingLinkId(null);
      setSelectedDealIds(new Set());
      setSelectedCompanyIds(new Set());
      setSelectedContactIds(new Set());
      setEntitySearch('');
      setRankedMap({});
      setAutoPreselected(false);
    }
  }, [open]);

  // Run scoring engine (run_type='manual') when picker opens, ranking recordings against this meeting.
  useEffect(() => {
    if (!open || !eventId || recordings.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        setRanking(true);
        const { data, error } = await supabase.functions.invoke('claap-rank-recordings-for-meeting', {
          body: {
            action: 'rank',
            event_id: eventId,
            recordings,
            meeting_context: {
              title: eventTitle || null,
              attendees: (attendeeEmails || []).map((e) => ({ email: e })),
            },
          },
        });
        if (cancelled) return;
        if (error) {
          console.warn('claap rank failed', error);
          return;
        }
        const map: Record<string, RankedEntry> = {};
        for (const r of (data?.ranked || []) as any[]) {
          map[r.external_id] = { score: r.score || 0, reasons: r.reasons || [] };
        }
        setRankedMap(map);
      } catch (err) {
        console.warn('claap rank failed', err);
      } finally {
        if (!cancelled) setRanking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, eventId, recordings]);

  // When user picks a recording, prefill suggested targets
  useEffect(() => {
    if (!selectedRecording || editingLinkId) return;
    const dealIds = new Set<string>();
    if (suggestedDealId) dealIds.add(suggestedDealId);
    suggestedDeals.forEach(d => dealIds.add(d.id));
    setSelectedDealIds(dealIds);
    setSelectedCompanyIds(new Set(suggestedCompanies.map(c => c.id)));
    setSelectedContactIds(new Set(suggestedContacts.map(c => c.id)));
  }, [selectedRecording, editingLinkId, suggestedDealId, suggestedDeals, suggestedCompanies, suggestedContacts]);

  const filteredRecordings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const linkedRecordingIds = new Set(existingLinks.map(l => l.recording_id));
    const list = q
      ? recordings.filter(r => {
          const title = (r.title || '').toLowerCase();
          const recorder = (r.recorder?.name || '').toLowerCase();
          const recorderEmail = (r.recorder?.email || '').toLowerCase();
          const participants = (r.meeting?.participants || [])
            .map(p => `${p.name || ''} ${p.email || ''}`)
            .join(' ')
            .toLowerCase();
          return (
            title.includes(q) ||
            recorder.includes(q) ||
            recorderEmail.includes(q) ||
            participants.includes(q)
          );
        })
      : recordings;
    const scored = list.map(r => ({
      ...r,
      _alreadyLinked: linkedRecordingIds.has(r.id),
      _score: rankedMap[r.id]?.score ?? 0,
      _reasons: rankedMap[r.id]?.reasons ?? [],
    }));
    // Sort by score desc, then by createdAt desc
    scored.sort((a, b) => {
      const ds = (b._score || 0) - (a._score || 0);
      if (Math.abs(ds) > 0.001) return ds;
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bt - at;
    });
    return scored.slice(0, 50);
  }, [recordings, search, existingLinks, rankedMap]);

  // Auto-preselect top candidate when ranking lands (only once per open, only when user hasn't picked one).
  useEffect(() => {
    if (!open || autoPreselected || selectedRecording || editingLinkId) return;
    if (Object.keys(rankedMap).length === 0) return;
    // Skip if any recording is already linked to this event — leave the user in the current state.
    if (existingLinks.length > 0) { setAutoPreselected(true); return; }
    const top = filteredRecordings[0];
    if (!top || !top._score || top._score < 0.65) { setAutoPreselected(true); return; }
    setSelectedRecording(top);
    setAutoPreselected(true);
  }, [open, autoPreselected, selectedRecording, editingLinkId, rankedMap, filteredRecordings, existingLinks.length]);

  const beginEdit = (link: ExistingLink) => {
    setEditingLinkId(link.id);
    setSelectedRecording({
      id: link.recording_id,
      title: link.recording_title || '',
      url: link.recording_url || '',
      thumbnailUrl: link.thumbnail_url || '',
      createdAt: link.recorded_at || '',
      durationSeconds: 0,
      labels: [],
      recorder: { attended: false, email: '', id: '', name: link.recorder_name || '' },
      state: '',
      transcripts: [],
    });
    setSelectedDealIds(new Set(link.deal_ids || []));
    setSelectedCompanyIds(new Set(link.company_ids || []));
    setSelectedContactIds(new Set(link.contact_ids || []));
  };

  const persistDealMirror = useCallback(async (rec: ClaapRecording, dealIds: string[]) => {
    if (!dealIds.length) return;
    const rows = dealIds.map(deal_id => ({
      deal_id,
      recording_id: rec.id,
      recording_title: rec.title || null,
      recording_url: rec.url || null,
      thumbnail_url: rec.thumbnailUrl || null,
      duration_seconds: rec.durationSeconds ? Math.round(rec.durationSeconds) : null,
      recorder_name: rec.recorder?.name || null,
      recorder_email: rec.recorder?.email || null,
      linked_by: user?.id || null,
    }));
    await supabase
      .from('deal_claap_recordings')
      .upsert(rows, { onConflict: 'deal_id,recording_id', ignoreDuplicates: true });
  }, [user?.id]);

  const handleSave = async () => {
    if (!company?.id || !selectedRecording) return;
    setSaving(true);
    try {
      const dealIds = Array.from(selectedDealIds);
      const companyIds = Array.from(selectedCompanyIds);
      const contactIds = Array.from(selectedContactIds);

      if (!dealIds.length && !companyIds.length && !contactIds.length) {
        toast.error('Pick at least one deal, company, or contact to link to.');
        setSaving(false);
        return;
      }

      const payload: any = {
        org_company_id: company.id,
        event_id: eventId,
        recording_id: selectedRecording.id,
        recording_title: selectedRecording.title || null,
        recording_url: selectedRecording.url || null,
        thumbnail_url: selectedRecording.thumbnailUrl || null,
        duration_seconds: selectedRecording.durationSeconds
          ? Math.round(selectedRecording.durationSeconds)
          : null,
        recorder_name: selectedRecording.recorder?.name || null,
        recorder_email: selectedRecording.recorder?.email || null,
        recorded_at: selectedRecording.createdAt || null,
        deal_ids: dealIds,
        company_ids: companyIds,
        contact_ids: contactIds,
        linked_by: user?.id || null,
      };

      const { error } = await (supabase.from('event_claap_recordings') as any)
        .upsert(payload, { onConflict: 'org_company_id,event_id,recording_id' });
      if (error) throw error;

      await persistDealMirror(selectedRecording, dealIds);

      // Also write the canonical primary_meeting link (best-effort, idempotent).
      try {
        const entry = rankedMap[selectedRecording.id];
        const { data: confirmData } = await supabase.functions.invoke('claap-rank-recordings-for-meeting', {
          body: {
            action: 'confirm',
            event_id: eventId,
            recording: selectedRecording,
            confidence: entry?.score ?? 0,
            reasons: entry?.reasons ?? [],
            meeting_context: {
              title: eventTitle || null,
              attendees: (attendeeEmails || []).map((e) => ({ email: e })),
            },
          },
        });
        await supabase.functions.invoke('claap-sync-recording-content', {
          body: {
            recording_id: (confirmData as any)?.recording_id || undefined,
            external_id: selectedRecording.id,
          },
        });
      } catch (e) {
        console.warn('canonical claap link write failed', e);
      }

      toast.success(editingLinkId ? 'Link updated' : 'Recording linked');
      setSelectedRecording(null);
      setEditingLinkId(null);
      setSelectedDealIds(new Set());
      setSelectedCompanyIds(new Set());
      setSelectedContactIds(new Set());
      await refetchLinks();
      qc.invalidateQueries({ queryKey: ['deal-claap-recordings'] });
    } catch (err: any) {
      console.error('Save claap link failed', err);
      toast.error(err?.message || 'Failed to save link');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (link: ExistingLink) => {
    try {
      const { error } = await (supabase.from('event_claap_recordings') as any)
        .delete()
        .eq('id', link.id);
      if (error) throw error;
      // Also remove from deal mirror for the deals it touched
      if (link.deal_ids?.length) {
        await supabase
          .from('deal_claap_recordings')
          .delete()
          .in('deal_id', link.deal_ids)
          .eq('recording_id', link.recording_id);
      }
      toast.success('Link removed');
      await refetchLinks();
      qc.invalidateQueries({ queryKey: ['deal-claap-recordings'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove link');
    }
  };

  const dealById = useMemo(() => Object.fromEntries(deals.map(d => [d.id, d])), [deals]);

  const dealsToShow = useMemo<DealOption[]>(() => {
    if (entitySearch.trim().length >= 2) return dealSearchResults;
    // selected + suggested
    const seen = new Set<string>();
    const out: DealOption[] = [];
    for (const id of selectedDealIds) {
      const d = dealById[id]; if (d) { out.push({ id: d.id, name: d.name, company: d.company }); seen.add(id); }
    }
    for (const d of suggestedDeals) {
      if (!seen.has(d.id)) { out.push(d); seen.add(d.id); }
    }
    return out;
  }, [entitySearch, dealSearchResults, selectedDealIds, suggestedDeals, dealById]);

  const companiesToShow = useMemo<CompanyOption[]>(() => {
    if (entitySearch.trim().length >= 2) return companyResults;
    const seen = new Set<string>();
    const out: CompanyOption[] = [];
    for (const c of suggestedCompanies) {
      if (!seen.has(c.id)) { out.push(c); seen.add(c.id); }
    }
    return out;
  }, [entitySearch, companyResults, suggestedCompanies]);

  const contactsToShow = useMemo<ContactOption[]>(() => {
    if (entitySearch.trim().length >= 2) return contactResults;
    const seen = new Set<string>();
    const out: ContactOption[] = [];
    for (const c of suggestedContacts) {
      if (!seen.has(c.id)) { out.push(c); seen.add(c.id); }
    }
    return out;
  }, [entitySearch, contactResults, suggestedContacts]);

  const totalSelected = selectedDealIds.size + selectedCompanyIds.size + selectedContactIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[min(960px,calc(100vw-32px))] max-h-[min(86vh,calc(100vh-32px))] p-0 overflow-hidden bg-background border-border z-[1320]">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-white/[0.08]">
          <DialogTitle className="flex items-center gap-2 text-base text-white">
            <Video className="h-4 w-4 text-primary" />
            Link Claap Recording
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            {eventTitle || 'Calendar event'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] min-h-0 max-h-[calc(86vh-130px)]">
          {/* LEFT: recordings + existing links */}
          <div className="flex flex-col min-h-0 border-r border-white/[0.06]">
            {/* Existing links */}
            {existingLinks.length > 0 && (
              <div className="px-4 pt-3 pb-2 border-b border-white/[0.06]">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-1.5">
                  Linked to this event ({existingLinks.length})
                </p>
                <ul className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {existingLinks.map(link => (
                    <li
                      key={link.id}
                      className={cn(
                        'rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5',
                        editingLinkId === link.id && 'ring-1 ring-primary/50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {link.recording_url ? (
                              <a
                                href={link.recording_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary hover:underline truncate inline-flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{link.recording_title || 'Untitled recording'}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-white truncate">{link.recording_title || 'Untitled recording'}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {link.deal_ids?.map(id => (
                              <Badge key={`d-${id}`} variant="outline" className="h-4 px-1.5 text-[9px] border-white/15 bg-white/[0.04] text-white/80">
                                <Briefcase className="h-2.5 w-2.5 mr-1" />
                                {dealById[id]?.name || id.slice(0, 6)}
                              </Badge>
                            ))}
                            {link.company_ids?.map(id => (
                              <Badge key={`c-${id}`} variant="outline" className="h-4 px-1.5 text-[9px] border-white/15 bg-white/[0.04] text-white/80">
                                <Building2 className="h-2.5 w-2.5 mr-1" />
                                {suggestedCompanies.find(c => c.id === id)?.name || id.slice(0, 6)}
                              </Badge>
                            ))}
                            {link.contact_ids?.map(id => (
                              <Badge key={`p-${id}`} variant="outline" className="h-4 px-1.5 text-[9px] border-white/15 bg-white/[0.04] text-white/80">
                                <User className="h-2.5 w-2.5 mr-1" />
                                {suggestedContacts.find(c => c.id === id)?.full_name || id.slice(0, 6)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white/70 hover:text-white" onClick={() => beginEdit(link)}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10" onClick={() => handleUnlink(link)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search recordings by title, attendee, or recorder…"
                  className="h-8 pl-8 text-xs bg-white/[0.03] border-white/10"
                  autoFocus
                />
              </div>
            </div>

            {/* Recordings list */}
            <ScrollArea className="flex-1 min-h-0 px-2 pb-2">
              {loadingRecordings ? (
                <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading recent recordings…
                </div>
              ) : filteredRecordings.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <Video className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-white">
                    {recordings.length === 0 ? 'No Claap recordings synced yet' : 'No recordings match your search'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {recordings.length === 0
                      ? 'Recordings appear here once Claap syncs your meetings.'
                      : 'Try a different keyword or attendee name.'}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 h-7 text-xs gap-1.5"
                    onClick={() => fetchRecordings(search || undefined)}
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredRecordings.map(r => {
                    const isActive = selectedRecording?.id === r.id;
                    const when = (() => {
                      try { return r.createdAt ? format(parseISO(r.createdAt), 'MMM d, yyyy') : ''; }
                      catch { return ''; }
                    })();
                    const participants = (r.meeting?.participants || []).slice(0, 3).map(p => p.name || p.email).filter(Boolean);
                    const score = (r as any)._score as number;
                    const band: 'auto' | 'review' | 'hold' = score >= 0.90 ? 'auto' : score >= 0.65 ? 'review' : 'hold';
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => { setEditingLinkId(null); setSelectedRecording(r); }}
                          className={cn(
                            'w-full text-left px-2.5 py-2 rounded-md transition-colors border',
                            isActive
                              ? 'bg-primary/10 border-primary/40'
                              : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-white truncate">
                                  {r.title || 'Untitled recording'}
                                </span>
                                {(r as any)._alreadyLinked && (
                                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                                    Linked
                                  </Badge>
                                )}
                                {score > 0 && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'h-4 px-1.5 text-[9px]',
                                      band === 'auto' && 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
                                      band === 'review' && 'border-amber-500/40 text-amber-300 bg-amber-500/10',
                                      band === 'hold' && 'border-white/15 text-muted-foreground bg-white/[0.04]',
                                    )}
                                  >
                                    {Math.round(score * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {when}
                                {r.recorder?.name ? ` · ${r.recorder.name}` : ''}
                                {participants.length ? ` · ${participants.join(', ')}` : ''}
                              </p>
                            </div>
                            {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* RIGHT: entity selectors */}
          <div className="flex flex-col min-h-0">
            {!selectedRecording ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
                <Sparkles className="h-6 w-6 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-white">Pick a recording</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Choose a recording on the left, then link it to a deal, company, or contact.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 pt-3 pb-2 border-b border-white/[0.06]">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-1">
                    Link to
                  </p>
                  <p className="text-xs text-white truncate">{selectedRecording.title || 'Untitled recording'}</p>
                  {(() => {
                    const entry = rankedMap[selectedRecording.id];
                    if (!entry || !entry.score) return null;
                    const pct = Math.round(entry.score * 100);
                    const auto = entry.score >= 0.90;
                    const review = !auto && entry.score >= 0.65;
                    if (!auto && !review) return null;
                    return (
                      <div className="mt-2 space-y-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 px-1.5 text-[10px] gap-1',
                            auto && 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
                            review && 'border-amber-500/40 text-amber-300 bg-amber-500/10',
                          )}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          {auto ? `Auto-matched (${pct}%)` : `Suggested (${pct}%)`}
                        </Badge>
                        {entry.reasons.length > 0 && (
                          <ul className="text-[10px] text-muted-foreground/80 space-y-0.5 pl-1">
                            {entry.reasons.slice(0, 4).map((r, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <Check className="h-2.5 w-2.5 text-emerald-400/70 shrink-0" />
                                <span className="truncate">{r.label}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                  <div className="relative mt-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={entitySearch}
                      onChange={e => setEntitySearch(e.target.value)}
                      placeholder="Search deals, companies, contacts…"
                      className="h-7 pl-8 text-xs bg-white/[0.03] border-white/10"
                    />
                  </div>
                </div>
                <ScrollArea className="flex-1 min-h-0 px-3 py-2">
                  {/* Deals */}
                  <EntitySection
                    icon={<Briefcase className="h-3 w-3" />}
                    label="Deals"
                    items={dealsToShow.map(d => ({ id: d.id, primary: d.name, secondary: d.company }))}
                    selectedIds={selectedDealIds}
                    onToggle={(id) => {
                      setSelectedDealIds(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      });
                    }}
                    emptyText={entitySearch.trim().length >= 2 ? 'No matching deals.' : 'No suggested deals.'}
                  />
                  {/* Companies */}
                  <EntitySection
                    icon={<Building2 className="h-3 w-3" />}
                    label="Companies"
                    items={companiesToShow.map(c => ({ id: c.id, primary: c.name, secondary: c.domain || '' }))}
                    selectedIds={selectedCompanyIds}
                    onToggle={(id) => {
                      setSelectedCompanyIds(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      });
                    }}
                    emptyText={entitySearch.trim().length >= 2 ? 'No matching companies.' : 'No suggested companies.'}
                  />
                  {/* Contacts */}
                  <EntitySection
                    icon={<User className="h-3 w-3" />}
                    label="Contacts"
                    items={contactsToShow.map(c => ({ id: c.id, primary: c.full_name || c.email || 'Unknown', secondary: c.email || '' }))}
                    selectedIds={selectedContactIds}
                    onToggle={(id) => {
                      setSelectedContactIds(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      });
                    }}
                    emptyText={entitySearch.trim().length >= 2 ? 'No matching contacts.' : 'No suggested contacts.'}
                  />
                </ScrollArea>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {selectedRecording
              ? totalSelected > 0
                ? `${totalSelected} target${totalSelected === 1 ? '' : 's'} selected`
                : 'Pick at least one deal, company, or contact'
              : `${existingLinks.length} existing link${existingLinks.length === 1 ? '' : 's'} on this event`}
          </p>
          <div className="flex items-center gap-2">
            {selectedRecording && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setSelectedRecording(null); setEditingLinkId(null); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={!selectedRecording || saving || totalSelected === 0}
              onClick={handleSave}
            >
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {editingLinkId ? 'Update link' : 'Save link'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntitySection({
  icon, label, items, selectedIds, onToggle, emptyText,
}: {
  icon: React.ReactNode;
  label: string;
  items: { id: string; primary: string; secondary?: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          {label}
        </span>
        {selectedIds.size > 0 && (
          <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-primary/40 text-primary bg-primary/10">
            {selectedIds.size}
          </Badge>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70 italic px-1">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map(it => {
            const checked = selectedIds.has(it.id);
            return (
              <li key={it.id}>
                <label
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                    checked ? 'bg-primary/10 border border-primary/30' : 'hover:bg-white/[0.04] border border-transparent',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(it.id)}
                    className="h-3.5 w-3.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white truncate">{it.primary}</p>
                    {it.secondary && (
                      <p className="text-[10px] text-muted-foreground truncate">{it.secondary}</p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}