import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronRight, Pencil, Check, X, HelpCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * DealCorrectionsLog
 *
 * Structured, in-app log of every Approval Queue decision captured on this
 * deal — approvals, edits, rejections, and "needs more context" requests.
 * Reads `approval_queue_audit` joined to `ai_action_queue` scoped to the
 * current deal. Powers the "AQ corrections stored in-app" policy so the
 * agent's learning loop and the reviewer's audit trail live in one place.
 */

interface AuditRow {
  id: string;
  created_at: string;
  action_type: string;
  decision: string;
  execution_status: string;
  was_edited: boolean;
  rejection_reason: string | null;
  failure_reason: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  approver_user_id: string | null;
  action_queue_id: string;
  queue_title?: string | null;
}

interface Props {
  dealId: string;
}

const decisionMeta: Record<string, { label: string; icon: JSX.Element; className: string }> = {
  approved:        { label: 'Approved',        icon: <Check className="h-3 w-3" />,       className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  edited_approved: { label: 'Edited & approved', icon: <Pencil className="h-3 w-3" />,    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  rejected:        { label: 'Rejected',        icon: <X className="h-3 w-3" />,           className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  more_context:    { label: 'Needs context',   icon: <HelpCircle className="h-3 w-3" />,  className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  reassigned:      { label: 'Reassigned',      icon: <HelpCircle className="h-3 w-3" />,  className: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  email_staged:    { label: 'Email staged',    icon: <Check className="h-3 w-3" />,       className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  email_sent:      { label: 'Email sent',      icon: <Check className="h-3 w-3" />,       className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

function humanizeActionType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DiffBlock({ oldValues, newValues }: { oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null }) {
  const keys = useMemo(() => {
    const s = new Set<string>();
    Object.keys(oldValues || {}).forEach((k) => s.add(k));
    Object.keys(newValues || {}).forEach((k) => s.add(k));
    return [...s];
  }, [oldValues, newValues]);

  if (keys.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No field-level diff captured.</div>;
  }

  return (
    <div className="space-y-1.5">
      {keys.map((k) => {
        const oldV = oldValues?.[k];
        const newV = newValues?.[k];
        const changed = JSON.stringify(oldV) !== JSON.stringify(newV);
        return (
          <div key={k} className="text-xs grid grid-cols-[120px_1fr] gap-2">
            <span className="text-muted-foreground truncate">{k}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {oldV !== undefined && (
                <span className={`px-1.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/5 text-rose-300 ${!changed ? 'opacity-40' : ''}`}>
                  {typeof oldV === 'object' ? JSON.stringify(oldV) : String(oldV)}
                </span>
              )}
              {changed && <span className="text-muted-foreground">→</span>}
              {newV !== undefined && changed && (
                <span className="px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-300">
                  {typeof newV === 'object' ? JSON.stringify(newV) : String(newV)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DealCorrectionsLog({ dealId }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [approvers, setApprovers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'corrections'>('corrections');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Find AQ items for this deal
        const { data: queueRows, error: qErr } = await supabase
          .from('ai_action_queue')
          .select('id, title, action_type')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(500);
        if (qErr) throw qErr;
        const queueIds = (queueRows || []).map((r: any) => r.id);
        const titleById = new Map<string, string>();
        (queueRows || []).forEach((r: any) => titleById.set(r.id, r.title));
        if (queueIds.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false); }
          return;
        }

        const { data: audit, error: aErr } = await supabase
          .from('approval_queue_audit')
          .select('*')
          .in('action_queue_id', queueIds)
          .order('created_at', { ascending: false });
        if (aErr) throw aErr;

        const enriched: AuditRow[] = (audit || []).map((r: any) => ({
          ...r,
          queue_title: titleById.get(r.action_queue_id) || null,
        }));

        // Best-effort approver name lookup
        const userIds = [...new Set(enriched.map((r) => r.approver_user_id).filter(Boolean) as string[])];
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);
          const map: Record<string, string> = {};
          (profiles || []).forEach((p: any) => {
            map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
          });
          if (!cancelled) setApprovers(map);
        }

        if (!cancelled) setRows(enriched);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load corrections');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dealId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.was_edited || r.decision === 'rejected' || r.decision === 'edited_approved' || r.decision === 'more_context');
  }, [rows, filter]);

  const stats = useMemo(() => {
    const s = { total: rows.length, edited: 0, rejected: 0, moreContext: 0, approvedClean: 0 };
    rows.forEach((r) => {
      if (r.decision === 'rejected') s.rejected++;
      else if (r.decision === 'edited_approved' || r.was_edited) s.edited++;
      else if (r.decision === 'more_context') s.moreContext++;
      else if (r.decision === 'approved') s.approvedClean++;
    });
    return s;
  }, [rows]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Approval Queue corrections</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every edit, rejection, and clarification captured on Deal Admin Agent proposals for this deal.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilter('corrections')}
            className={`px-2 py-1 rounded border ${filter === 'corrections' ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}
          >
            Corrections only ({stats.edited + stats.rejected + stats.moreContext})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-1 rounded border ${filter === 'all' ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}
          >
            All decisions ({stats.total})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading corrections…
        </div>
      ) : error ? (
        <div className="text-xs text-rose-400 py-4">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-6 text-center">
          {rows.length === 0
            ? 'No Approval Queue decisions recorded for this deal yet.'
            : 'No corrections yet — every AQ item was approved as proposed.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => {
            const meta = decisionMeta[r.decision] || { label: r.decision, icon: <HelpCircle className="h-3 w-3" />, className: 'bg-white/5 text-muted-foreground border-white/10' };
            const isOpen = !!expanded[r.id];
            const reason = r.rejection_reason || r.failure_reason;
            return (
              <div key={r.id} className="rounded-md border border-white/10 bg-black/20 overflow-hidden">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <Badge variant="outline" className={`gap-1 text-[10px] uppercase tracking-wide ${meta.className}`}>
                    {meta.icon}
                    {meta.label}
                  </Badge>
                  {r.was_edited && r.decision !== 'edited_approved' && (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30">
                      Edited
                    </Badge>
                  )}
                  <span className="text-xs text-foreground truncate flex-1">
                    {r.queue_title || humanizeActionType(r.action_type)}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {r.approver_user_id && approvers[r.approver_user_id] ? approvers[r.approver_user_id] : 'System'}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wide">Action type</div>
                        <div className="text-foreground">{humanizeActionType(r.action_type)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wide">Execution</div>
                        <div className="text-foreground capitalize">{r.execution_status}</div>
                      </div>
                    </div>
                    {reason && (
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                          {r.rejection_reason ? 'Reviewer feedback' : 'Failure reason'}
                        </div>
                        <div className="text-xs text-foreground bg-white/[0.03] border border-white/10 rounded p-2 whitespace-pre-wrap">
                          {reason}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                        Proposed → Applied
                      </div>
                      <DiffBlock oldValues={r.old_values} newValues={r.new_values} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DealCorrectionsLog;