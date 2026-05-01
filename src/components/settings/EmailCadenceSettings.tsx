import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, RefreshCw, Clock, Users, Search, Trash2, Check, X, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface CadenceJob {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  contacts_processed: number;
  messages_scanned: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface CadenceProfilePreview {
  id: string;
  contact_email: string;
  contact_name: string | null;
  avg_followup_interval_days: number | null;
  outbound_count: number;
  last_contact_at: string | null;
  relationship_type: string | null;
}

const RELATIONSHIP_OPTIONS = [
  'founder', 'lender', 'client', 'partner', 'internal', 'vendor', 'other',
] as const;

const PAGE_SIZE = 25;

/**
 * Settings → Email → "Learn My Cadence". On-demand only — never scheduled.
 * Triggers the `learn-email-cadence` edge function which scans the user's
 * cached Gmail history (180 days) and builds a per-contact cadence profile.
 * The output is consumed by the email AI panel for follow-up nudges and
 * tone-matched drafts.
 */
export function EmailCadenceSettings() {
  const { user } = useAuth();
  const [job, setJob] = useState<CadenceJob | null>(null);
  const [running, setRunning] = useState(false);
  const [previews, setPreviews] = useState<CadenceProfilePreview[]>([]);
  const [profileCount, setProfileCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Editable browser state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CadenceProfilePreview[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ relationship_type: string; avg_followup_interval_days: string }>({
    relationship_type: '',
    avg_followup_interval_days: '',
  });

  const refresh = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: jobs }, { count }, { data: top }] = await Promise.all([
      supabase
        .from('email_cadence_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('email_cadence_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('email_cadence_profiles')
        .select('id, contact_email, contact_name, avg_followup_interval_days, outbound_count, last_contact_at, relationship_type')
        .eq('user_id', user.id)
        .order('outbound_count', { ascending: false })
        .limit(8),
    ]);
    setJob((jobs?.[0] as CadenceJob | undefined) ?? null);
    setProfileCount(count ?? 0);
    setPreviews((top as CadenceProfilePreview[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadRows = async () => {
    if (!user?.id) return;
    setRowsLoading(true);
    let q = supabase
      .from('email_cadence_profiles')
      .select(
        'id, contact_email, contact_name, avg_followup_interval_days, outbound_count, last_contact_at, relationship_type',
        { count: 'exact' },
      )
      .eq('user_id', user.id);
    if (debouncedSearch) {
      const escaped = debouncedSearch.replace(/[%_,]/g, (c) => `\\${c}`);
      q = q.or(`contact_email.ilike.%${escaped}%,contact_name.ilike.%${escaped}%`);
    }
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await q
      .order('last_contact_at', { ascending: false, nullsFirst: false })
      .range(from, to);
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data as CadenceProfilePreview[]) ?? []);
      setRowsTotal(count ?? 0);
    }
    setRowsLoading(false);
  };

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, page, debouncedSearch, profileCount]);

  const startEdit = (row: CadenceProfilePreview) => {
    setEditingId(row.id);
    setEditDraft({
      relationship_type: row.relationship_type ?? '',
      avg_followup_interval_days:
        row.avg_followup_interval_days != null ? String(row.avg_followup_interval_days) : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (row: CadenceProfilePreview) => {
    const intervalRaw = editDraft.avg_followup_interval_days.trim();
    const intervalNum = intervalRaw === '' ? null : Number(intervalRaw);
    if (intervalNum != null && (!Number.isFinite(intervalNum) || intervalNum < 0 || intervalNum > 365)) {
      toast.error('Follow-up interval must be between 0 and 365 days.');
      return;
    }
    const { error } = await supabase
      .from('email_cadence_profiles')
      .update({
        relationship_type: editDraft.relationship_type || null,
        avg_followup_interval_days: intervalNum,
      })
      .eq('id', row.id)
      .eq('user_id', user!.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Cadence updated');
    setEditingId(null);
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              relationship_type: editDraft.relationship_type || null,
              avg_followup_interval_days: intervalNum,
            }
          : r,
      ),
    );
  };

  const deleteRow = async (row: CadenceProfilePreview) => {
    if (!confirm(`Remove cadence data for ${row.contact_name || row.contact_email}?`)) return;
    const { error } = await supabase
      .from('email_cadence_profiles')
      .delete()
      .eq('id', row.id)
      .eq('user_id', user!.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Removed');
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setProfileCount((c) => Math.max(0, c - 1));
    setRowsTotal((c) => Math.max(0, c - 1));
  };

  const totalPages = Math.max(1, Math.ceil(rowsTotal / PAGE_SIZE));

  const runScan = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('learn-email-cadence');
      if (error) throw error;
      const out = data as { contactsProcessed?: number; messagesScanned?: number; error?: string };
      if (out?.error) throw new Error(out.error);
      toast.success(
        `Cadence learned for ${out?.contactsProcessed ?? 0} contacts (${out?.messagesScanned ?? 0} messages scanned).`,
      );
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run cadence scan');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-[hsl(var(--outlook-blue))]" />
          Learn My Cadence
        </CardTitle>
        <CardDescription>
          Scan your inbox + sent mail to learn how often you typically follow up
          with each contact, your average response time, and the tone you use
          per relationship type. Runs on demand only — nothing is sent or
          shared. The AI panel uses this to nudge follow-ups and match your
          voice in drafts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runScan} disabled={running} size="sm" className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {profileCount > 0 ? 'Re-scan now' : 'Scan my inbox'}
          </Button>
          {loading ? (
            <span className="text-xs text-muted-foreground">Loading…</span>
          ) : job ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={job.status === 'done' ? 'secondary' : job.status === 'error' ? 'destructive' : 'outline'} className="gap-1">
                <Clock className="h-3 w-3" />
                Last scan: {formatDistanceToNow(new Date(job.finished_at || job.created_at), { addSuffix: true })}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {profileCount} contacts learned
              </Badge>
              {job.status === 'error' && job.error_message && (
                <span className="text-destructive text-xs">{job.error_message}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Never run yet.</span>
          )}
        </div>

        {previews.length > 0 && (
          <div className="rounded-md border border-border/40 overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Top contacts by volume
            </div>
            <div className="divide-y divide-border/40">
              {previews.map((p) => (
                <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center">
                  <div className="col-span-5 truncate">
                    <div className="font-medium truncate">{p.contact_name || p.contact_email}</div>
                    {p.contact_name && (
                      <div className="text-[10px] text-muted-foreground truncate">{p.contact_email}</div>
                    )}
                  </div>
                  <div className="col-span-2 text-muted-foreground">
                    {p.relationship_type || '—'}
                  </div>
                  <div className="col-span-2 text-muted-foreground">
                    {p.outbound_count} sent
                  </div>
                  <div className="col-span-3 text-right">
                    {p.avg_followup_interval_days != null ? (
                      <span>
                        every <strong>{Number(p.avg_followup_interval_days).toFixed(1)}</strong> days
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {profileCount > 0 && (
          <div className="rounded-md border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Cadence Database — editable
              </span>
              <div className="relative w-56">
                <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or email"
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/10 border-b border-border/40">
              <div className="col-span-4">Contact</div>
              <div className="col-span-2">Relationship</div>
              <div className="col-span-2">Sent</div>
              <div className="col-span-2">Avg follow-up</div>
              <div className="col-span-2 text-right">Last contact</div>
            </div>

            <div className="divide-y divide-border/40 max-h-[420px] overflow-auto">
              {rowsLoading ? (
                <div className="px-3 py-6 text-xs text-muted-foreground flex items-center gap-2 justify-center">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : rows.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                  No matching contacts.
                </div>
              ) : (
                rows.map((p) => {
                  const isEditing = editingId === p.id;
                  return (
                    <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center group">
                      <div className="col-span-4 truncate">
                        <div className="font-medium truncate">{p.contact_name || p.contact_email}</div>
                        {p.contact_name && (
                          <div className="text-[10px] text-muted-foreground truncate">{p.contact_email}</div>
                        )}
                      </div>
                      <div className="col-span-2">
                        {isEditing ? (
                          <Select
                            value={editDraft.relationship_type || 'unset'}
                            onValueChange={(v) =>
                              setEditDraft((d) => ({ ...d, relationship_type: v === 'unset' ? '' : v }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unset">—</SelectItem>
                              {RELATIONSHIP_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{p.relationship_type || '—'}</span>
                        )}
                      </div>
                      <div className="col-span-2 text-muted-foreground">{p.outbound_count}</div>
                      <div className="col-span-2">
                        {isEditing ? (
                          <Input
                            value={editDraft.avg_followup_interval_days}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, avg_followup_interval_days: e.target.value }))
                            }
                            placeholder="days"
                            inputMode="decimal"
                            className="h-7 text-xs"
                          />
                        ) : p.avg_followup_interval_days != null ? (
                          <span>every <strong>{Number(p.avg_followup_interval_days).toFixed(1)}</strong>d</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-muted-foreground text-[10px]">
                          {p.last_contact_at
                            ? formatDistanceToNow(new Date(p.last_contact_at), { addSuffix: true })
                            : '—'}
                        </span>
                        {isEditing ? (
                          <>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveEdit(p)} aria-label="Save">
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit} aria-label="Cancel">
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={() => startEdit(p)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                              onClick={() => deleteRow(p)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/10 border-t border-border/40 text-[11px] text-muted-foreground">
              <span>
                {rowsTotal === 0
                  ? 'No contacts'
                  : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, rowsTotal)} of ${rowsTotal}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={page === 0 || rowsLoading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </Button>
                <span>{page + 1} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={page + 1 >= totalPages || rowsLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}