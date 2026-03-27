import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface PartnerMemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  partnerName: string;
  onReadReceiptUpdated?: () => void;
}

interface MemoData {
  id?: string;
  memo_type: string;
  who_are_they: string;
  icp: string;
  benefit_from_us: string;
  benefit_from_them: string;
  notes: string;
}

interface AuditEntry {
  id: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  changed_at: string;
  user_name: string;
}

const EMPTY_MEMO: MemoData = {
  memo_type: 'Channel',
  who_are_they: '',
  icp: '',
  benefit_from_us: '',
  benefit_from_them: '',
  notes: '',
};

const FIELD_LABELS: Record<string, string> = {
  memo_type: 'Type',
  who_are_they: 'Who are they / What do they do',
  icp: 'ICP',
  benefit_from_us: 'Benefits from us',
  benefit_from_them: 'Benefits from them',
  notes: 'Notes',
};

function AutoExpandTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  useEffect(() => { resize(); }, [value, resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => { onChange(e.target.value); }}
      onInput={resize}
      placeholder={placeholder}
      rows={2}
      className="mt-2 w-full resize-none overflow-hidden rounded-md border bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  );
}

export function PartnerMemoModal({ open, onOpenChange, partnerId, partnerName }: PartnerMemoModalProps) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [memo, setMemo] = useState<MemoData>(EMPTY_MEMO);
  const [savedMemo, setSavedMemo] = useState<MemoData>(EMPTY_MEMO);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchAuditLog = useCallback(async () => {
    if (!partnerId) return;
    const { data, error } = await supabase
      .from('partner_memo_audit_log' as any)
      .select('id, field_changed, old_value, new_value, changed_at, user_id')
      .eq('partner_id', partnerId)
      .order('changed_at', { ascending: false })
      .limit(50);
    if (error) { console.error(error); return; }

    // Fetch user names for all unique user_ids
    const userIds = [...new Set((data as any[]).map(d => d.user_id).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', userIds);
      if (profiles) {
        (profiles as any[]).forEach(p => {
          userMap[p.user_id] = p.display_name || p.email || 'Unknown';
        });
      }
    }

    setAuditLog((data as any[]).map(d => ({
      id: d.id,
      field_changed: d.field_changed,
      old_value: d.old_value || '',
      new_value: d.new_value || '',
      changed_at: d.changed_at,
      user_name: userMap[d.user_id] || 'Unknown',
    })));
  }, [partnerId]);

  useEffect(() => {
    if (!open || !partnerId) return;
    setLoading(true);
    setHistoryOpen(false);
    supabase
      .from('partner_memos' as any)
      .select('*')
      .eq('partner_id', partnerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading memo:', error);
        } else if (data) {
          const d = data as any;
          const loaded: MemoData = {
            id: d.id,
            memo_type: d.memo_type || 'Channel',
            who_are_they: d.who_are_they || '',
            icp: d.icp || '',
            benefit_from_us: d.benefit_from_us || '',
            benefit_from_them: d.benefit_from_them || '',
            notes: d.notes || '',
          };
          setMemo(loaded);
          setSavedMemo(loaded);
        } else {
          setMemo(EMPTY_MEMO);
          setSavedMemo(EMPTY_MEMO);
        }
        setLoading(false);
      });
    fetchAuditLog();
  }, [open, partnerId, fetchAuditLog]);

  const handleSave = async () => {
    if (!company?.id || !user?.id) return;
    setSaving(true);
    try {
      // Determine changed fields
      const trackedFields = ['memo_type', 'who_are_they', 'icp', 'benefit_from_us', 'benefit_from_them', 'notes'] as const;
      const changes: { field: string; oldVal: string; newVal: string }[] = [];
      for (const f of trackedFields) {
        if (memo[f] !== savedMemo[f]) {
          changes.push({ field: f, oldVal: savedMemo[f], newVal: memo[f] });
        }
      }

      const payload = {
        partner_id: partnerId,
        company_id: company.id,
        memo_type: memo.memo_type,
        who_are_they: memo.who_are_they,
        icp: memo.icp,
        benefit_from_us: memo.benefit_from_us,
        benefit_from_them: memo.benefit_from_them,
        notes: memo.notes,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (memo.id) {
        const { error } = await supabase
          .from('partner_memos' as any)
          .update(payload)
          .eq('id', memo.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('partner_memos' as any)
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        setMemo(prev => ({ ...prev, id: (data as any).id }));
      }

      // Insert audit log entries for changes
      if (changes.length > 0) {
        const auditEntries = changes.map(c => ({
          partner_id: partnerId,
          company_id: company.id,
          user_id: user.id,
          field_changed: c.field,
          old_value: c.oldVal,
          new_value: c.newVal,
        }));
        await supabase.from('partner_memo_audit_log' as any).insert(auditEntries);
        fetchAuditLog();
      }

      setSavedMemo({ ...memo });
      toast.success('Memo saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save memo');
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof MemoData, value: string) =>
    setMemo(prev => ({ ...prev, [field]: value }));

  const formatAuditEntry = (entry: AuditEntry) => {
    const label = FIELD_LABELS[entry.field_changed] || entry.field_changed;
    const ts = format(new Date(entry.changed_at), "MMM d, yyyy 'at' h:mm a");
    if (entry.field_changed === 'memo_type') {
      return `${entry.user_name} changed ${label} from ${entry.old_value || '(empty)'} to ${entry.new_value} — ${ts}`;
    }
    return `${entry.user_name} updated ${label} — ${ts}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-800 border-slate-700 text-white p-0">
        {/* Document Header */}
        <div className="border-b border-slate-700 p-6 pb-4">
          <h2 className="text-xl font-semibold text-white">{partnerName}</h2>
          <p className="text-sm text-slate-400 mt-0.5">Partner Memo</p>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Loading memo…</div>
        ) : (
          <div className="px-6 pt-1.5 pb-6 space-y-6">
            {/* 1. Type */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Type</Label>
              <Select value={memo.memo_type} onValueChange={(v) => update('memo_type', v)}>
                <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Channel">Channel</SelectItem>
                  <SelectItem value="Branding">Branding</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 2. Who are they */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Who are they / What do they do</Label>
              <AutoExpandTextarea value={memo.who_are_they} onChange={v => update('who_are_they', v)} placeholder="Describe the partner organization…" />
            </div>

            {/* 3. ICP */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">ICP (Ideal Client Profile)</Label>
              <AutoExpandTextarea value={memo.icp} onChange={v => update('icp', v)} placeholder="Describe their ideal client profile…" />
            </div>

            {/* 4. What do they benefit from us? */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">What do they benefit from us?</Label>
              <AutoExpandTextarea value={memo.benefit_from_us} onChange={v => update('benefit_from_us', v)} placeholder="What value do we provide to them…" />
            </div>

            {/* 5. What do we benefit from them? */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">What do we benefit from them?</Label>
              <AutoExpandTextarea value={memo.benefit_from_them} onChange={v => update('benefit_from_them', v)} placeholder="What value do they provide to us…" />
            </div>

            {/* 6. Notes */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Notes</Label>
              <AutoExpandTextarea value={memo.notes} onChange={v => update('notes', v)} placeholder="Additional notes..." />
            </div>

            {/* Change History */}
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-slate-400 uppercase tracking-wider font-semibold hover:text-slate-300 transition-colors">
                {historyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Change History ({auditLog.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                {auditLog.length === 0 ? (
                  <p className="text-xs text-slate-500">No changes recorded yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {auditLog.map(entry => (
                      <p key={entry.id} className="text-xs text-slate-400 leading-relaxed">
                        {formatAuditEntry(entry)}
                      </p>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Save */}
            <div className="pt-2 border-t border-slate-700">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Memo'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
