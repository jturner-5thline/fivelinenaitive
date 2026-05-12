import { useState, ReactNode, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

const ICP_OPTIONS = ['Debt Advisory', 'M&A', 'Equity', 'Placement Agent', 'Broker', 'Other'];
const PROSPECT_TYPE_OPTIONS = ['Decision Maker', 'Gatekeeper', 'Connector', 'Market Intelligence'];
const OWNED_BY_OPTIONS = ['Paz', 'Flor', 'James'];
const SOURCE_OPTIONS = ['LinkedIn Outreach', 'Email Outreach', 'Warm Outreach', 'Referral', 'Inbound'];
const DM_PRESENT_OPTIONS = ['Yes', 'Gatekeeper', 'Unknown'];
const OUTCOME_OPTIONS = ['Moved forward', 'Not a fit', 'Tabled', 'Feedback only', 'Disqualified'];
const WHY_NOT_OPTIONS = [
  'Wrong persona', 'Wrong segment', 'Built own solution', 'Entrenched stack',
  'Product gap', 'Timing', 'No close attempt made',
];
import { ADVANCE_REASON_LABELS, AdvanceReasonCategory } from '@/types/deal';
const ADVANCE_OPTIONS = Object.keys(ADVANCE_REASON_LABELS) as AdvanceReasonCategory[];
const ADVANCING_OUTCOMES = new Set(['Moved forward']);
const NEEDS_REASON = new Set(['Not a fit', 'Tabled', 'Disqualified']);
const MAX_WHY_NOT = 3;
const MAX_BULLETS = 3;

function limitBullets(text: string, max = MAX_BULLETS): string {
  const lines = text.split('\n');
  let kept = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      out.push(line);
      continue;
    }
    if (kept >= max) break;
    out.push(line);
    kept++;
  }
  return out.join('\n');
}

interface Props {
  trigger?: ReactNode;
  pipelineId: string;
  stages: DealStageOption[];
  defaultStage?: string;
  onCreated?: () => void;
  /** When provided, the dialog operates in edit mode for this deal. */
  deal?: any;
  /** Controlled open state (used in edit mode). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateNaitiveDealDialog({ trigger, pipelineId, stages, defaultStage, onCreated, deal, open: openProp, onOpenChange }: Props) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setOpenInternal(o);
  };
  const isEdit = !!deal?.id;
  const [submitting, setSubmitting] = useState(false);

  // Section 1
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);
  const [icpCategory, setIcpCategory] = useState('');
  const [prospectType, setProspectType] = useState('');
  // Section 2
  const [ownedBy, setOwnedBy] = useState('');
  const [source, setSource] = useState('');
  // Section 3
  const [stage, setStage] = useState(defaultStage || stages[0]?.id || '');
  const [nextStep, setNextStep] = useState('');
  const [nextStepDate, setNextStepDate] = useState<Date | undefined>();
  const [dmPresent, setDmPresent] = useState('');
  const [dmName, setDmName] = useState('');
  // Section 4
  const [outcome, setOutcome] = useState('');
  const [whyNot, setWhyNot] = useState<string[]>([]);
  // Why Moving Forward (advance reason) — only logged when outcome = "Moved forward"
  const [advanceCategory, setAdvanceCategory] = useState<AdvanceReasonCategory | ''>('');
  const [advanceNotes, setAdvanceNotes] = useState('');
  // Section 5
  const [painPoints, setPainPoints] = useState('');
  const [objections, setObjections] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [keySignal, setKeySignal] = useState('');
  const [productGap, setProductGap] = useState('');

  const reset = () => {
    setCompanyName(''); setContactName(''); setContactTitle('');
    setContactEmail(''); setContactEmailError(null);
    setIcpCategory(''); setProspectType('');
    setOwnedBy(''); setSource('');
    setStage(defaultStage || stages[0]?.id || '');
    setNextStep(''); setNextStepDate(undefined); setDmPresent(''); setDmName('');
    setOutcome(''); setWhyNot([]);
    setAdvanceCategory(''); setAdvanceNotes('');
    setPainPoints(''); setObjections(''); setCompetitors(''); setKeySignal(''); setProductGap('');
  };

  // Hydrate fields from existing deal when in edit mode and dialog opens.
  useEffect(() => {
    if (!open || !isEdit || !deal) return;
    setCompanyName(deal.company || '');
    setContactName(deal.contact || '');
    setContactTitle(deal.contactTitle || '');
    setContactEmail((deal as any).contactEmail || (deal as any).contact_email || '');
    setIcpCategory(deal.icpCategory || '');
    setProspectType(deal.prospectType || '');
    setOwnedBy(deal.ownedBy || deal.manager || '');
    setSource(deal.sourcedVia || '');
    setStage(deal.stage || defaultStage || stages[0]?.id || '');
    setNextStep(deal.nextStep || '');
    setNextStepDate(deal.nextStepDate ? new Date(deal.nextStepDate) : undefined);
    setDmPresent(deal.dmPresent || '');
    setDmName(deal.dmName || '');
    setOutcome(deal.outcome || '');
    setWhyNot(Array.isArray(deal.whyNotMovingForward) ? deal.whyNotMovingForward : []);
    setPainPoints(deal.painPointsConfirmed || '');
    setObjections(deal.objectionsRaised || '');
    setCompetitors(deal.competitorsMentioned || '');
    setKeySignal(deal.keySignal || '');
    setProductGap(deal.productGapFlagged || '');
  }, [open, isEdit, deal?.id]);

  const toggleWhyNot = (opt: string) => {
    setWhyNot(prev => {
      if (prev.includes(opt)) return prev.filter(x => x !== opt);
      if (prev.length >= MAX_WHY_NOT) {
        toast.error(`Pick up to ${MAX_WHY_NOT} reasons`);
        return prev;
      }
      return [...prev, opt];
    });
  };

  const handleSubmit = async () => {
    if (!companyName.trim()) return toast.error('Company Name is required');
    if (!contactName.trim()) return toast.error('Contact Name is required');
    const email = contactEmail.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setContactEmailError('Contact email is required');
      document.getElementById('naitive-contact-email')?.focus();
      return toast.error('Contact Email is required');
    }
    if (!emailRe.test(email)) {
      setContactEmailError('Enter a valid email address');
      document.getElementById('naitive-contact-email')?.focus();
      return toast.error('Enter a valid email address');
    }
    setContactEmailError(null);
    if (!icpCategory) return toast.error('ICP Category is required');
    if (!prospectType) return toast.error('Prospect Type is required');
    if (!ownedBy) return toast.error('Owned By is required');
    if (!source) return toast.error('Source is required');
    if (!stage) return toast.error('Current Stage is required');
    if (NEEDS_REASON.has(outcome) && whyNot.length === 0) {
      return toast.error('Select at least one reason for "Why Not Moving Forward"');
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload: any = {
        company: companyName.trim(),
        contact: contactName.trim(),
        contact_title: contactTitle.trim() || null,
        contact_email: email,
        icp_category: icpCategory,
        prospect_type: prospectType,
        owned_by: ownedBy,
        manager: ownedBy,
        sourced_via: source,
        stage,
        next_step: nextStep.trim() || null,
        next_step_date: nextStepDate ? format(nextStepDate, 'yyyy-MM-dd') : null,
        dm_present: dmPresent || null,
        dm_name: dmName.trim() || null,
        outcome: outcome || null,
        why_not_moving_forward: NEEDS_REASON.has(outcome) ? whyNot : [],
        pain_points_confirmed: painPoints.trim() || null,
        objections_raised: objections.trim() || null,
        competitors_mentioned: competitors.trim() || null,
        key_signal: keySignal.trim() || null,
        product_gap_flagged: productGap.trim() || null,
        pipeline_id: pipelineId,
        company_id: FIFTH_LINE_COMPANY_ID,
        deal_class: 'naitive',
        user_id: user.id,
        value: 0,
        status: 'on-track',
      };

      let dealId: string | undefined;
      if (isEdit) {
        // Don't overwrite immutable / pipeline routing fields on edit.
        delete payload.pipeline_id;
        delete payload.company_id;
        delete payload.deal_class;
        delete payload.user_id;
        delete payload.value;
        delete payload.status;
        const { error } = await supabase.from('deals').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', deal.id);
        if (error) throw error;
        dealId = deal.id;
      } else {
        const { data: inserted, error } = await supabase.from('deals').insert(payload).select('id').single();
        if (error) throw error;
        dealId = inserted?.id;
      }
      // If user logged a "Why Moving Forward" reason, persist it now that the
      // deal exists. We need the new deal id, so re-query by company + user.
      if (ADVANCING_OUTCOMES.has(outcome) && advanceCategory && dealId) {
        await supabase.from('deal_advance_reasons' as any).insert({
          deal_id: dealId,
          reason_category: advanceCategory,
          reason_notes: advanceNotes.trim() || null,
          created_by: user.id,
        });
      }
      toast.success(isEdit ? 'Deal updated' : 'Deal created');
      if (!isEdit) reset();
      setOpen(false);
      onCreated?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || (isEdit ? 'Failed to update deal' : 'Failed to create deal'));
    } finally {
      setSubmitting(false);
    }
  };

  const showWhyNot = NEEDS_REASON.has(outcome);
  const showWhyForward = ADVANCING_OUTCOMES.has(outcome);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && !isEdit) reset(); }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Deal' : 'Create New Deal'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section 1 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company Name" required>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
              </Field>
              <Field label="Contact Name" required>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Doe" />
              </Field>
              <Field label="Contact Email" required error={contactEmailError || undefined}>
                <Input
                  id="naitive-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => { setContactEmail(e.target.value); if (contactEmailError) setContactEmailError(null); }}
                  placeholder="jane@acme.com"
                  aria-invalid={!!contactEmailError}
                />
              </Field>
              <Field label="Contact Title">
                <Input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="VP Finance" />
              </Field>
              <Field label="ICP Category" required>
                <SimpleSelect value={icpCategory} onChange={setIcpCategory} options={ICP_OPTIONS} placeholder="Select category" />
              </Field>
              <Field label="Prospect Type" required className="col-span-2">
                <SimpleSelect value={prospectType} onChange={setProspectType} options={PROSPECT_TYPE_OPTIONS} placeholder="Select type" />
              </Field>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ownership</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owned By" required>
                <SimpleSelect value={ownedBy} onChange={setOwnedBy} options={OWNED_BY_OPTIONS} placeholder="Select owner" />
              </Field>
              <Field label="Source" required>
                <SimpleSelect value={source} onChange={setSource} options={SOURCE_OPTIONS} placeholder="Select source" />
              </Field>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Stage & Timing</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current Stage" required>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Next Step Date">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !nextStepDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {nextStepDate ? format(nextStepDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={nextStepDate} onSelect={setNextStepDate} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label="Next Step" className="col-span-2">
                <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="What happens next?" />
              </Field>
              <Field label="DM Present">
                <SimpleSelect value={dmPresent} onChange={setDmPresent} options={DM_PRESENT_OPTIONS} placeholder="Select" />
              </Field>
              <Field label="DM Name">
                <Input value={dmName} onChange={(e) => setDmName(e.target.value)} placeholder="Only if different from Contact" />
              </Field>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Outcome (optional)</h3>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Outcome">
                <SimpleSelect value={outcome} onChange={(v) => { setOutcome(v); if (!NEEDS_REASON.has(v)) setWhyNot([]); }} options={OUTCOME_OPTIONS} placeholder="Select outcome" />
              </Field>
              {showWhyNot && (
                <Field label={`Why Not Moving Forward (pick up to ${MAX_WHY_NOT})`}>
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                    {WHY_NOT_OPTIONS.map(opt => {
                      const checked = whyNot.includes(opt);
                      const disabled = !checked && whyNot.length >= MAX_WHY_NOT;
                      return (
                        <label
                          key={opt}
                          className={cn(
                            'flex items-center gap-2 text-sm',
                            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() => toggleWhyNot(opt)}
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {whyNot.length}/{MAX_WHY_NOT} selected
                  </p>
                </Field>
              )}
              {showWhyForward && (
                <Field label="Why Moving Forward">
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                    <Select value={advanceCategory} onValueChange={(v) => setAdvanceCategory(v as AdvanceReasonCategory)}>
                      <SelectTrigger><SelectValue placeholder="Pick an accelerator…" /></SelectTrigger>
                      <SelectContent>
                        {ADVANCE_OPTIONS.map(c => (
                          <SelectItem key={c} value={c}>{ADVANCE_REASON_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      rows={2}
                      value={advanceNotes}
                      onChange={(e) => setAdvanceNotes(e.target.value)}
                      placeholder="Optional context — what specifically moved this forward?"
                    />
                  </div>
                </Field>
              )}
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Call Intelligence (optional)</h3>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Pain Points Confirmed">
                <Textarea
                  value={painPoints}
                  onChange={(e) => setPainPoints(limitBullets(e.target.value))}
                  placeholder="Max 3 bullets — one per line"
                  rows={3}
                />
              </Field>
              <Field label="Objections Raised">
                <Textarea
                  value={objections}
                  onChange={(e) => setObjections(limitBullets(e.target.value))}
                  placeholder="Max 3 bullets — one per line"
                  rows={3}
                />
              </Field>
              <Field label="Competitors or Tools Mentioned">
                <Input value={competitors} onChange={(e) => setCompetitors(e.target.value)} />
              </Field>
              <Field label="Key Signal">
                <Input value={keySignal} onChange={(e) => setKeySignal(e.target.value)} placeholder="One line — the most important thing they said" />
              </Field>
              <Field label="Product Gap Flagged">
                <Input value={productGap} onChange={(e) => setProductGap(e.target.value)} placeholder="Specific feature they said was missing" />
              </Field>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, className, children, error }: { label: string; required?: boolean; className?: string; children: ReactNode; error?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SimpleSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}