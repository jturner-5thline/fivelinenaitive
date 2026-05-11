import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Deal } from '@/types/deal';
import { ReactNode, useEffect, useState } from 'react';
import { useDealStages } from '@/contexts/DealStagesContext';

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
const NEEDS_REASON = new Set(['Not a fit', 'Tabled', 'Disqualified']);
const MAX_WHY_NOT = 3;

interface Props {
  deal: Deal;
  onUpdate: (field: keyof Deal, value: any) => void;
}

/**
 * Naitive-pipeline-specific Deal Information panel.
 * Mirrors the field set in CreateNaitiveDealDialog so what users enter at
 * create / edit time is exactly what they see (and can edit) on detail.
 */
export function NaitiveDealInformation({ deal, onUpdate }: Props) {
  const { stages: dealStages } = useDealStages();
  // Local state only for fields that don't already round-trip cleanly through `deal`.
  const [whyNotLocal, setWhyNotLocal] = useState<string[]>([]);

  useEffect(() => {
    const raw = (deal as any).whyNotMovingForward;
    if (Array.isArray(raw)) setWhyNotLocal(raw);
    else if (typeof raw === 'string' && raw.length > 0) {
      try {
        const parsed = JSON.parse(raw);
        setWhyNotLocal(Array.isArray(parsed) ? parsed : [raw]);
      } catch {
        setWhyNotLocal([raw]);
      }
    } else {
      setWhyNotLocal([]);
    }
  }, [deal.id, deal.whyNotMovingForward]);

  const toggleWhyNot = (opt: string) => {
    setWhyNotLocal(prev => {
      const next = prev.includes(opt)
        ? prev.filter(x => x !== opt)
        : prev.length >= MAX_WHY_NOT ? prev : [...prev, opt];
      onUpdate('whyNotMovingForward' as keyof Deal, next as any);
      return next;
    });
  };

  const showWhyNot = NEEDS_REASON.has(deal.outcome || '');
  const nextStepDate = deal.nextStepDate ? new Date(deal.nextStepDate) : undefined;

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-lg">Deal Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Info */}
        <Section title="Basic Info">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Company Name">
              <Input value={deal.company || ''} onChange={(e) => onUpdate('company', e.target.value)} />
            </Field>
            <Field label="Contact Name">
              <Input value={deal.contact || ''} onChange={(e) => onUpdate('contact', e.target.value)} />
            </Field>
            <Field label="Contact Title">
              <Input value={deal.contactTitle || ''} onChange={(e) => onUpdate('contactTitle' as keyof Deal, e.target.value)} />
            </Field>
            <Field label="ICP Category">
              <SimpleSelect value={deal.icpCategory || ''} options={ICP_OPTIONS} onChange={(v) => onUpdate('icpCategory' as keyof Deal, v)} placeholder="Select category" />
            </Field>
            <Field label="Prospect Type" className="md:col-span-2">
              <SimpleSelect value={deal.prospectType || ''} options={PROSPECT_TYPE_OPTIONS} onChange={(v) => onUpdate('prospectType' as keyof Deal, v)} placeholder="Select type" />
            </Field>
          </div>
        </Section>

        {/* Ownership */}
        <Section title="Ownership">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Owned By">
              <SimpleSelect
                value={deal.ownedBy || deal.manager || ''}
                options={OWNED_BY_OPTIONS}
                onChange={(v) => { onUpdate('ownedBy' as keyof Deal, v); onUpdate('manager', v); }}
                placeholder="Select owner"
              />
            </Field>
            <Field label="Source">
              <SimpleSelect value={deal.sourcedVia || ''} options={SOURCE_OPTIONS} onChange={(v) => onUpdate('sourcedVia', v)} placeholder="Select source" />
            </Field>
          </div>
        </Section>

        {/* Stage & Timing */}
        <Section title="Stage & Timing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Current Stage">
              <Select value={deal.stage} onValueChange={(v) => onUpdate('stage', v)}>
                <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {dealStages.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
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
                  <Calendar
                    mode="single"
                    selected={nextStepDate}
                    onSelect={(d) => onUpdate('nextStepDate' as keyof Deal, d ? format(d, 'yyyy-MM-dd') : null)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </Field>
            <Field label="Next Step" className="md:col-span-2">
              <Input value={deal.nextStep || ''} onChange={(e) => onUpdate('nextStep' as keyof Deal, e.target.value)} placeholder="What happens next?" />
            </Field>
            <Field label="DM Present">
              <SimpleSelect value={deal.dmPresent || ''} options={DM_PRESENT_OPTIONS} onChange={(v) => onUpdate('dmPresent' as keyof Deal, v)} placeholder="Select" />
            </Field>
            <Field label="DM Name">
              <Input value={(deal as any).dmName || ''} onChange={(e) => onUpdate('dmName' as keyof Deal, e.target.value)} placeholder="Only if different from Contact" />
            </Field>
          </div>
        </Section>

        {/* Outcome */}
        <Section title="Outcome">
          <div className="space-y-3">
            <Field label="Outcome">
              <SimpleSelect
                value={deal.outcome || ''}
                options={OUTCOME_OPTIONS}
                onChange={(v) => {
                  onUpdate('outcome' as keyof Deal, v);
                  if (!NEEDS_REASON.has(v)) {
                    setWhyNotLocal([]);
                    onUpdate('whyNotMovingForward' as keyof Deal, [] as any);
                  }
                }}
                placeholder="Select outcome"
              />
            </Field>
            {showWhyNot && (
              <Field label={`Why Not Moving Forward (pick up to ${MAX_WHY_NOT})`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border p-3">
                  {WHY_NOT_OPTIONS.map(opt => {
                    const checked = whyNotLocal.includes(opt);
                    const disabled = !checked && whyNotLocal.length >= MAX_WHY_NOT;
                    return (
                      <label
                        key={opt}
                        className={cn('flex items-center gap-2 text-sm', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}
                      >
                        <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggleWhyNot(opt)} />
                        {opt}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{whyNotLocal.length}/{MAX_WHY_NOT} selected</p>
              </Field>
            )}
          </div>
        </Section>

        {/* Call Intelligence */}
        <Section title="Call Intelligence">
          <div className="space-y-3">
            <Field label="Pain Points Confirmed">
              <Textarea rows={3} value={deal.painPointsConfirmed || ''} onChange={(e) => onUpdate('painPointsConfirmed' as keyof Deal, e.target.value)} placeholder="Max 3 bullets — one per line" />
            </Field>
            <Field label="Objections Raised">
              <Textarea rows={3} value={deal.objectionsRaised || ''} onChange={(e) => onUpdate('objectionsRaised' as keyof Deal, e.target.value)} placeholder="Max 3 bullets — one per line" />
            </Field>
            <Field label="Competitors or Tools Mentioned">
              <Input value={deal.competitorsMentioned || ''} onChange={(e) => onUpdate('competitorsMentioned' as keyof Deal, e.target.value)} />
            </Field>
            <Field label="Key Signal">
              <Input value={deal.keySignal || ''} onChange={(e) => onUpdate('keySignal' as keyof Deal, e.target.value)} placeholder="One line — the most important thing they said" />
            </Field>
            <Field label="Product Gap Flagged">
              <Input value={deal.productGapFlagged || ''} onChange={(e) => onUpdate('productGapFlagged' as keyof Deal, e.target.value)} placeholder="Specific feature they said was missing" />
            </Field>
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs">{label}</Label>
      {children}
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