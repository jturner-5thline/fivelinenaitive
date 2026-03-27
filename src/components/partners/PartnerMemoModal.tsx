import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PartnerMemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  partnerName: string;
}

interface MemoData {
  id?: string;
  memo_type: string;
  who_are_they: string;
  icp: string;
  benefit_from_us: string;
  benefit_from_them: string;
}

const EMPTY_MEMO: MemoData = {
  memo_type: 'Channel',
  who_are_they: '',
  icp: '',
  benefit_from_us: '',
  benefit_from_them: '',
};

export function PartnerMemoModal({ open, onOpenChange, partnerId, partnerName }: PartnerMemoModalProps) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [memo, setMemo] = useState<MemoData>(EMPTY_MEMO);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !partnerId) return;
    setLoading(true);
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
          setMemo({
            id: d.id,
            memo_type: d.memo_type || 'Channel',
            who_are_they: d.who_are_they || '',
            icp: d.icp || '',
            benefit_from_us: d.benefit_from_us || '',
            benefit_from_them: d.benefit_from_them || '',
          });
        } else {
          setMemo(EMPTY_MEMO);
        }
        setLoading(false);
      });
  }, [open, partnerId]);

  const handleSave = async () => {
    if (!company?.id || !user?.id) return;
    setSaving(true);
    try {
      const payload = {
        partner_id: partnerId,
        company_id: company.id,
        memo_type: memo.memo_type,
        who_are_they: memo.who_are_they,
        icp: memo.icp,
        benefit_from_us: memo.benefit_from_us,
        benefit_from_them: memo.benefit_from_them,
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
      toast.success('Memo saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save memo');
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof MemoData, value: string) =>
    setMemo(prev => ({ ...prev, [field]: value }));

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
          <div className="p-6 space-y-6">
            {/* 1. Type */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Type</Label>
              <RadioGroup
                value={memo.memo_type}
                onValueChange={(v) => update('memo_type', v)}
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Channel" id="memo-channel" className="border-slate-500 text-blue-400" />
                  <Label htmlFor="memo-channel" className="text-sm text-white cursor-pointer">Channel</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Branding" id="memo-branding" className="border-slate-500 text-blue-400" />
                  <Label htmlFor="memo-branding" className="text-sm text-white cursor-pointer">Branding</Label>
                </div>
              </RadioGroup>
            </div>

            {/* 2. Who are they */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Who are they / What do they do</Label>
              <Textarea
                value={memo.who_are_they}
                onChange={e => update('who_are_they', e.target.value)}
                rows={3}
                placeholder="Describe the partner organization…"
                className="mt-2 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {/* 3. ICP */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">ICP (Ideal Client Profile)</Label>
              <Textarea
                value={memo.icp}
                onChange={e => update('icp', e.target.value)}
                rows={3}
                placeholder="Describe their ideal client profile…"
                className="mt-2 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {/* 4. What do they benefit from us? */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">What do they benefit from us?</Label>
              <Textarea
                value={memo.benefit_from_us}
                onChange={e => update('benefit_from_us', e.target.value)}
                rows={3}
                placeholder="What value do we provide to them…"
                className="mt-2 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {/* 5. What do we benefit from them? */}
            <div>
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">What do we benefit from them?</Label>
              <Textarea
                value={memo.benefit_from_them}
                onChange={e => update('benefit_from_them', e.target.value)}
                rows={3}
                placeholder="What value do they provide to us…"
                className="mt-2 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

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
