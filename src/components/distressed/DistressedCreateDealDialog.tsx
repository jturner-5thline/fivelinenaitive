import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { parseAmountToNumber, formatAmountWithCommas } from '@/utils/currencyFormat';
import { CurrentLenderPicker } from './CurrentLenderPicker';
import { DISTRESSED_DEAL_CLASS, DISTRESSED_DEBT_STAGES } from '@/lib/distressedDebtPipeline';

interface Props { pipelineId: string | null; onCreated: () => void; trigger: React.ReactNode }

export function DistressedCreateDealDialog({ pipelineId, onCreated, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [amount, setAmount] = useState('');
  const [owner, setOwner] = useState('');
  const [narrative, setNarrative] = useState('');
  const [lender, setLender] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setCompany(''); setAmount(''); setOwner(''); setNarrative(''); setLender(null); };

  const submit = async () => {
    if (!company.trim()) { toast.error('Company name is required'); return; }
    if (!pipelineId) { toast.error('Pipeline is still loading'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('deals').insert({
      company: company.trim(),
      value: parseAmountToNumber(amount) || 0,
      deal_owner: owner.trim() || null,
      manager: owner.trim() || '',
      narrative: narrative.trim() || null,
      stage: DISTRESSED_DEBT_STAGES[0].id,
      pipeline_id: pipelineId,
      company_id: FIFTH_LINE_COMPANY_ID,
      deal_class: DISTRESSED_DEAL_CLASS,
      current_lender_id: lender?.id ?? null,
      current_lender_name: lender?.name ?? null,
      user_id: user?.id,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal created');
    reset();
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Distressed Debt Deal</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1"><Label>Company *</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div className="space-y-1"><Label>Deal Amount</Label><Input value={amount} inputMode="decimal" placeholder="$0" onChange={(e) => setAmount(formatAmountWithCommas(e.target.value))} /></div>
          <div className="space-y-1"><Label>Deal Owner</Label><Input value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
          <div className="sm:col-span-2 space-y-1"><Label>Current Lender</Label><CurrentLenderPicker lenderId={lender?.id} lenderName={lender?.name} onChange={setLender} /></div>
          <div className="sm:col-span-2 space-y-1"><Label>Narrative</Label><Textarea rows={3} value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="What is this deal?" /></div>
        </div>
        <p className="text-[11px] text-muted-foreground">Related parties can be added from the deal once it's created.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Deal'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
