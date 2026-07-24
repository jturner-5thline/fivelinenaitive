/**
 * AddOutstandingItemsCard — Approval Queue detail card for
 * `action_type === 'add_outstanding_items'` items produced by the Deal
 * Admin Agent when a funding source (lender) emails asking for
 * information / diligence items.
 *
 * The card lists each extracted item the lender requested. The reviewer
 * can un-check items to skip, edit descriptions and due dates in-place,
 * then Approve — every checked row is inserted into
 * `outstanding_items` on the referenced deal with the funding source
 * tagged as the requester.
 */
import { useMemo, useState } from 'react';
import { Building2, ListChecks, Mail, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { QueuedAiAction } from '@/hooks/useAiActionQueue';
import { useAuth } from '@/contexts/AuthContext';

interface RequestedItem {
  description: string;
  due_date: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source_quote?: string | null;
}

interface EditableItem extends RequestedItem {
  _key: string;
  _checked: boolean;
}

function coerceItems(item: QueuedAiAction): RequestedItem[] {
  const nv = (item.new_values ?? {}) as Record<string, any>;
  const pl = (item.payload ?? {}) as Record<string, any>;
  const raw =
    (Array.isArray(nv.items) && nv.items) ||
    (Array.isArray(pl.items) && pl.items) ||
    [];
  return raw
    .map((r: any): RequestedItem | null => {
      const description = String(r?.description ?? '').trim();
      if (!description) return null;
      return {
        description,
        due_date: typeof r?.due_date === 'string' ? r.due_date : null,
        priority: ['low', 'normal', 'high', 'urgent'].includes(r?.priority)
          ? r.priority
          : 'normal',
        source_quote: typeof r?.source_quote === 'string' ? r.source_quote : null,
      };
    })
    .filter((v): v is RequestedItem => !!v);
}

export function AddOutstandingItemsCard({ item }: { item: QueuedAiAction }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const nv = (item.new_values ?? {}) as Record<string, any>;
  const pl = (item.payload ?? {}) as Record<string, any>;
  const lenderName: string | null =
    nv.lender_name ?? pl.lender_name ?? nv.requested_by_lender_name ?? null;
  const lenderContactName: string | null =
    nv.requested_by_contact_name ?? pl.requested_by_contact_name ?? null;
  const lenderContactEmail: string | null =
    nv.requested_by_contact_email ?? pl.requested_by_contact_email ?? null;
  const lenderId: string | null = nv.lender_id ?? pl.lender_id ?? null;
  const sourceThreadId: string | null =
    nv.source_thread_id ?? pl.source_thread_id ?? null;
  const sourceQuoteSummary: string | null =
    nv.source_summary ?? pl.source_summary ?? null;

  const initial = useMemo<EditableItem[]>(
    () =>
      coerceItems(item).map((r, i) => ({
        ...r,
        _key: `${item.id}:${i}`,
        _checked: true,
      })),
    [item],
  );
  const [rows, setRows] = useState<EditableItem[]>(initial);
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);

  const patchRow = (key: string, patch: Partial<EditableItem>) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((r) => r._key !== key));
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        _key: `new:${Date.now()}:${prev.length}`,
        _checked: true,
        description: '',
        due_date: null,
        priority: 'normal',
        source_quote: null,
      },
    ]);

  const confirmed = rows.filter(
    (r) => r._checked && r.description.trim().length > 0,
  );

  async function handleApprove() {
    if (!item.deal_id) {
      toast.error('Missing deal on this queue item');
      return;
    }
    if (confirmed.length === 0) {
      toast.error('Select at least one item to add');
      return;
    }
    setBusy('a');
    try {
      const now = new Date().toISOString();
      const inserts = confirmed.map((r, idx) => ({
        deal_id: item.deal_id!,
        lender_id: lenderId,
        description: r.description.trim(),
        due_date: r.due_date || null,
        priority: r.priority || 'normal',
        status: 'pending',
        user_id: user?.id ?? null,
        position: idx,
        source_metadata: {
          source: 'deal_admin_agent',
          requested_by_lender_id: lenderId,
          requested_by_lender_name: lenderName,
          requested_by_contact_name: lenderContactName,
          requested_by_contact_email: lenderContactEmail,
          source_thread_id: sourceThreadId,
          source_quote: r.source_quote ?? null,
          ai_action_queue_id: item.id,
          confirmed_at: now,
        },
      }));
      const { error } = await (supabase as any)
        .from('outstanding_items')
        .insert(inserts);
      if (error) throw error;

      // Activity log for traceability.
      try {
        await supabase.from('activity_logs').insert({
          deal_id: item.deal_id,
          activity_type: 'outstanding_items_added',
          description: `Added ${confirmed.length} outstanding item${confirmed.length === 1 ? '' : 's'} requested by ${lenderName || lenderContactName || 'a funding source'}.`,
          user_id: user?.id ?? null,
        } as any);
      } catch (e) {
        console.warn('[AddOutstandingItemsCard] activity log failed', e);
      }

      await supabase
        .from('ai_action_queue')
        .update({
          status: 'approved',
          approved_at: now,
          executed_at: now,
          execution_result: {
            inserted_count: confirmed.length,
            lender_id: lenderId,
            source_thread_id: sourceThreadId,
          },
        } as any)
        .eq('id', item.id);

      qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
      qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
      qc.invalidateQueries({ queryKey: ['outstanding-items', item.deal_id] });
      toast.success(
        `Added ${confirmed.length} outstanding item${confirmed.length === 1 ? '' : 's'} to ${item.deal_name || 'the deal'}`,
      );
    } catch (e: any) {
      console.error('[AddOutstandingItemsCard] approve failed', e);
      toast.error(`Could not add items: ${e?.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDismiss() {
    setBusy('r');
    try {
      const now = new Date().toISOString();
      await supabase
        .from('ai_action_queue')
        .update({ status: 'dismissed', dismissed_at: now } as any)
        .eq('id', item.id);
      qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
      qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
      toast.message('Dismissed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-[#ecedf4]">
      <div className="rounded-md border border-white/[0.14] bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 text-[13px]">
          <ListChecks className="h-3.5 w-3.5 text-[#5ecdf5]" />
          <span className="font-medium">{item.title}</span>
        </div>
        {item.description ? (
          <p className="mt-1.5 text-xs text-[#ecedf4]/65 leading-relaxed">
            {item.description}
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-[#ecedf4]/60">
          {lenderName ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              Requested by {lenderName}
            </span>
          ) : null}
          {lenderContactEmail ? (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {lenderContactName ? `${lenderContactName} · ` : ''}
              {lenderContactEmail}
            </span>
          ) : null}
        </div>
        {sourceQuoteSummary ? (
          <blockquote className="mt-2 text-[11.5px] text-[#ecedf4]/60 italic border-l-2 border-white/[0.14] pl-2">
            {sourceQuoteSummary}
          </blockquote>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-[#ecedf4]/55">
            Items to add ({confirmed.length}/{rows.length})
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={addRow}
            className="h-7 text-[11px] text-[#5ecdf5]"
          >
            + Add item
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-[11.5px] text-[#ecedf4]/55">
            No items extracted. Add one manually or dismiss.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r._key}
                className="rounded-md border border-white/[0.14] bg-white/[0.03] p-2.5"
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={r._checked}
                    onCheckedChange={(v) =>
                      patchRow(r._key, { _checked: v === true })
                    }
                    className="mt-1.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Textarea
                      value={r.description}
                      onChange={(e) =>
                        patchRow(r._key, { description: e.target.value })
                      }
                      rows={2}
                      placeholder="Item description"
                      className="min-h-[46px] text-[12.5px] bg-white/[0.04] border-white/[0.14] resize-y"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[10px] uppercase tracking-wide text-[#ecedf4]/55">
                        Due
                      </label>
                      <Input
                        type="date"
                        value={r.due_date ?? ''}
                        onChange={(e) =>
                          patchRow(r._key, {
                            due_date: e.target.value || null,
                          })
                        }
                        className="h-7 w-[150px] text-[11.5px] bg-white/[0.04] border-white/[0.14]"
                      />
                      <select
                        value={r.priority}
                        onChange={(e) =>
                          patchRow(r._key, {
                            priority: e.target.value as EditableItem['priority'],
                          })
                        }
                        className="h-7 text-[11.5px] bg-white/[0.04] border border-white/[0.14] rounded px-2 text-[#ecedf4]"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      {r.source_quote ? (
                        <span
                          className="text-[10.5px] text-[#ecedf4]/50 italic truncate max-w-[220px]"
                          title={r.source_quote}
                        >
                          “{r.source_quote}”
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r._key)}
                    className="p-1 text-[#ecedf4]/50 hover:text-red-300"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="gradient"
          onClick={handleApprove}
          disabled={busy !== null || confirmed.length === 0}
        >
          {busy === 'a'
            ? 'Adding…'
            : `Add ${confirmed.length} outstanding item${confirmed.length === 1 ? '' : 's'}`}
        </Button>
        <Button
          variant="ghost"
          onClick={handleDismiss}
          disabled={busy !== null}
          className="text-[#ecedf4]/70"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}