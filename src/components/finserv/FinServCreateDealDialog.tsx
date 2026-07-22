import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { formatAmountWithCommas, parseAmountToNumber } from '@/utils/currencyFormat';

/* ─── Option lists ───────────────────────────────────────────── */
const LEAD_SOURCES = ['Referral', 'Networking', 'Inbound', 'Partner', 'Other'] as const;
const OPPORTUNITY_TYPES = [
  'New One-Time Project (e.g., cleanup, RiskReady)',
  'New Ongoing Engagement',
  'Expansion',
  'Renewal',
  'Reactivation (returning dormant client or prospect)',
  'Agentic Support',
] as const;
const SERVICES = [
  'Bookkeeping',
  'Controllership',
  'FP&A',
  'CFO Advisory',
  'Transaction Advisory',
  'HR & Compliance Advisory',
  'RiskReady',
] as const;
const FEE_TYPES = ['Fixed Fee', 'Variable Billing', 'Hybrid (Fixed + Variable)'] as const;
const DEAL_STAGES: { id: string; label: string }[] = [
  { id: 'fs-in-development', label: 'In Development' },
  { id: 'fs-qualification', label: 'Qualification' },
  { id: 'fs-discovery', label: 'Discovery (first substantive conversation)' },
  { id: 'fs-qualified', label: 'Qualified (confirmed fit, moving toward scope)' },
  { id: 'fs-scoping', label: 'Scoping' },
  { id: 'fs-proposal-sent', label: 'Proposal Sent' },
  { id: 'fs-negotiation', label: 'Negotiation' },
  { id: 'fs-closed-won', label: 'Active Client' },
  { id: 'fs-churned', label: 'Churned' },
  { id: 'fs-closed-lost', label: 'Closed Lost' },
];
export const FINSERV_OWNERS = ['Scott Williams', 'Siddhi Bhangale', 'Kris Lawless'] as const;

/* ─── Validation schema ──────────────────────────────────────── */
const formSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company Name is required').max(120),
    primaryContact: z.string().trim().min(1, 'Primary Contact is required').max(120),
    contactEmail: z
      .string()
      .trim()
      .min(1, 'Contact Email is required')
      .email('Enter a valid email address')
      .max(255),
    leadSource: z.enum(LEAD_SOURCES, { required_error: 'Lead Source is required' }),
    referralSource: z.string().trim().max(200).optional(),
    opportunityType: z.enum(OPPORTUNITY_TYPES, { required_error: 'Opportunity Type is required' }),
    servicesOffered: z.array(z.string()).min(1, 'Select at least one service'),
    feeType: z.enum(FEE_TYPES, { required_error: 'Fee Type is required' }),
    mrr: z.string().optional(),
    oneTimeRevenue: z.string().optional(),
    projectedCloseDate: z.date({ required_error: 'Projected Close Date is required' }),
    contractStartDate: z.date().optional(),
    contractEndDate: z.date().optional(),
    dealStage: z.string().min(1, 'Deal Stage is required'),
    onHold: z.boolean(),
    dealOwner: z.enum(FINSERV_OWNERS, { required_error: 'Deal Owner is required' }),
  })
  .refine(
    data => data.leadSource !== 'Referral' || (data.referralSource && data.referralSource.trim().length > 0),
    { message: 'Referral Source is required when Lead Source = Referral', path: ['referralSource'] },
  )
  .refine(
    data => !data.contractStartDate || !data.contractEndDate || data.contractEndDate >= data.contractStartDate,
    { message: 'Contract End Date must be on or after Start Date', path: ['contractEndDate'] },
  );

type FormErrors = Partial<Record<keyof z.infer<typeof formSchema>, string>>;

interface FinServCreateDealDialogProps {
  trigger?: React.ReactNode;
  pipelineId: string | null;
  onCreated?: () => void;
}

/* ─── Component ──────────────────────────────────────────────── */
export function FinServCreateDealDialog({ trigger, pipelineId, onCreated }: FinServCreateDealDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Form state
  const [companyName, setCompanyName] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [leadSource, setLeadSource] = useState<string>('');
  const [referralSource, setReferralSource] = useState('');
  const [opportunityType, setOpportunityType] = useState<string>('');
  const [servicesOffered, setServicesOffered] = useState<string[]>([]);
  const [feeType, setFeeType] = useState<string>('');
  const [mrr, setMrr] = useState('');
  const [oneTimeRevenue, setOneTimeRevenue] = useState('');
  const [projectedCloseDate, setProjectedCloseDate] = useState<Date | undefined>();
  const [contractStartDate, setContractStartDate] = useState<Date | undefined>();
  const [contractEndDate, setContractEndDate] = useState<Date | undefined>();
  const [dealStage, setDealStage] = useState<string>('fs-qualification');
  const [onHold, setOnHold] = useState(false);
  const [dealOwner, setDealOwner] = useState<string>('');

  const resetForm = () => {
    setCompanyName('');
    setPrimaryContact('');
    setContactEmail('');
    setLeadSource('');
    setReferralSource('');
    setOpportunityType('');
    setServicesOffered([]);
    setFeeType('');
    setMrr('');
    setOneTimeRevenue('');
    setProjectedCloseDate(undefined);
    setContractStartDate(undefined);
    setContractEndDate(undefined);
    setDealStage('fs-qualification');
    setOnHold(false);
    setDealOwner('');
    setErrors({});
  };

  const toggleService = (service: string) => {
    setServicesOffered(prev => (prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be signed in');
      return;
    }

    const result = formSchema.safeParse({
      companyName,
      primaryContact,
      contactEmail,
      leadSource,
      referralSource: referralSource || undefined,
      opportunityType,
      servicesOffered,
      feeType,
      mrr,
      oneTimeRevenue,
      projectedCloseDate,
      contractStartDate,
      contractEndDate,
      dealStage,
      onHold,
      dealOwner,
    });

    if (!result.success) {
      const newErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (key && !newErrors[key]) newErrors[key] = issue.message;
      }
      setErrors(newErrors);
      toast.error('Please fix the highlighted fields');
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const data = result.data;
      const insertPayload: Record<string, any> = {
        company: data.companyName,
        contact: data.primaryContact,
        contact_email: data.contactEmail,
        stage: data.dealStage,
        deal_owner: data.dealOwner,
        pipeline_id: pipelineId || null,
        company_id: FIFTH_LINE_COMPANY_ID,
        deal_class: 'finserv',
        engagement_type: 'advisory',
        status: null,
        user_id: user.id,
        // Seed `value` from MRR + One-Time Revenue so the new pipeline
        // card, per-stage totals, and Weighted Value KPI immediately show
        // the correct dollars. The same mirror is maintained on every
        // subsequent edit inside useDealsDatabase.updateDeal.
        value:
          (parseAmountToNumber(data.mrr || '') || 0) +
          (parseAmountToNumber(data.oneTimeRevenue || '') || 0),
        // FinServ-specific fields
        lead_source: data.leadSource,
        referral_source: data.referralSource || null,
        opportunity_type: data.opportunityType,
        services_offered: data.servicesOffered,
        fee_type: data.feeType,
        mrr: parseAmountToNumber(data.mrr || '') || null,
        one_time_revenue: parseAmountToNumber(data.oneTimeRevenue || '') || null,
        projected_close_date: format(data.projectedCloseDate, 'yyyy-MM-dd'),
        contract_start_date: data.contractStartDate ? format(data.contractStartDate, 'yyyy-MM-dd') : null,
        contract_end_date: data.contractEndDate ? format(data.contractEndDate, 'yyyy-MM-dd') : null,
        on_hold: data.onHold,
      };

      const { data: created, error } = await supabase
        .from('deals')
        .insert(insertPayload as any)
        .select('id')
        .single();

      if (error) throw error;

      toast.success(`Deal "${data.companyName}" created`);
      setOpen(false);
      resetForm();
      if (onCreated) onCreated();
      if (created?.id) navigate(`/deal/${created.id}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create deal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const Req = () => <span className="text-destructive">*</span>;

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="col-span-12 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-5 mb-2 first:mt-0">
      {children}
    </div>
  );

  const Helper = ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[12px] leading-4 text-muted-foreground mt-1 h-4 truncate">{children ?? '\u00A0'}</p>
  );

  const FieldLabel = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => (
    <Label htmlFor={htmlFor} className="text-sm font-medium mb-1.5 block leading-5">
      {children}
    </Label>
  );

  const showReferral = leadSource === 'Referral';

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[760px] lg:max-w-[960px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle>Create New Deal</DialogTitle>
          <DialogDescription>Add a deal to the FinServ pipeline.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-3.5 gap-x-4 [grid-auto-rows:min-content] items-start">
              {/* ── Section 1 — Company & Contact (two-column stacked block) ── */}
              <SectionHeader>Company &amp; Contact</SectionHeader>

              {/* LEFT column — contact stack */}
              <div className="md:col-span-6 grid grid-cols-1 gap-y-3.5 [grid-auto-rows:min-content] items-start">
                <div>
                  <FieldLabel htmlFor="companyName">Company Name <Req /></FieldLabel>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    maxLength={120}
                    placeholder="Enter company name"
                    className="h-10"
                  />
                  <Helper>{errors.companyName ? <span className="text-destructive">{errors.companyName}</span> : null}</Helper>
                </div>
                <div>
                  <FieldLabel htmlFor="primaryContact">Primary Contact <Req /></FieldLabel>
                  <Input
                    id="primaryContact"
                    value={primaryContact}
                    onChange={e => setPrimaryContact(e.target.value)}
                    maxLength={120}
                    placeholder="e.g., Jane Doe"
                    className="h-10"
                  />
                  <Helper>{errors.primaryContact ? <span className="text-destructive">{errors.primaryContact}</span> : null}</Helper>
                </div>
                <div>
                  <FieldLabel htmlFor="contactEmail">Contact Email <Req /></FieldLabel>
                  <Input
                    id="contactEmail"
                    type="email"
                    autoComplete="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    maxLength={255}
                    placeholder="jane@company.com"
                    className="h-10"
                  />
                  <Helper>{errors.contactEmail ? <span className="text-destructive">{errors.contactEmail}</span> : null}</Helper>
                </div>
              </div>

              {/* RIGHT column — classification stack (aligned row-for-row) */}
              <div className="md:col-span-6 grid grid-cols-1 gap-y-3.5 [grid-auto-rows:min-content] items-start">
                <div>
                  <FieldLabel>Lead Source <Req /></FieldLabel>
                  <Select value={leadSource} onValueChange={setLeadSource}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select lead source" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Helper>{errors.leadSource ? <span className="text-destructive">{errors.leadSource}</span> : null}</Helper>
                </div>
                <div>
                  <FieldLabel>Opportunity Type <Req /></FieldLabel>
                  <Select value={opportunityType} onValueChange={setOpportunityType}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select opportunity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPPORTUNITY_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Helper>{errors.opportunityType ? <span className="text-destructive">{errors.opportunityType}</span> : null}</Helper>
                </div>
                <div>
                  <FieldLabel>Deal Owner <Req /></FieldLabel>
                  <Select value={dealOwner} onValueChange={setDealOwner}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {FINSERV_OWNERS.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Helper>{errors.dealOwner ? <span className="text-destructive">{errors.dealOwner}</span> : null}</Helper>
                </div>
              </div>

              {/* Conditional Referral Source — full-width row beneath the two-column block */}
              {showReferral && (
                <div className="md:col-span-12">
                  <FieldLabel htmlFor="referralSource">Referral Source <Req /></FieldLabel>
                  <Input
                    id="referralSource"
                    value={referralSource}
                    onChange={e => setReferralSource(e.target.value)}
                    maxLength={200}
                    placeholder="Who referred this opportunity"
                    className="h-10"
                  />
                  <Helper>
                    {errors.referralSource ? (
                      <span className="text-destructive">{errors.referralSource}</span>
                    ) : (
                      'Who specifically referred this opportunity.'
                    )}
                  </Helper>
                </div>
              )}

              {/* ── Section 3 — Scope & Fees ── */}
              <SectionHeader>Scope &amp; Fees</SectionHeader>

              <div className="md:col-span-12">
                <FieldLabel>Services Offered <Req /></FieldLabel>
                <div className="flex flex-wrap gap-1.5 max-h-[88px] overflow-hidden">
                  {SERVICES.map(svc => {
                    const checked = servicesOffered.includes(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => toggleService(svc)}
                        className={cn(
                          'h-8 px-3 rounded-full text-xs font-medium border transition-colors',
                          checked
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-input hover:bg-muted',
                        )}
                      >
                        {svc}
                      </button>
                    );
                  })}
                </div>
                <Helper>{errors.servicesOffered ? <span className="text-destructive">{errors.servicesOffered}</span> : null}</Helper>
              </div>

              <div className="md:col-span-4">
                <FieldLabel>Fee Type <Req /></FieldLabel>
                <Select value={feeType} onValueChange={setFeeType}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select fee type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_TYPES.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Helper>{errors.feeType ? <span className="text-destructive">{errors.feeType}</span> : null}</Helper>
              </div>

              <div className="md:col-span-4">
                <FieldLabel htmlFor="mrr">Monthly Recurring Revenue</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">$</span>
                  <Input
                    id="mrr"
                    inputMode="numeric"
                    value={mrr}
                    onChange={e => setMrr(formatAmountWithCommas(e.target.value))}
                    placeholder="0"
                    className="h-10 pl-7"
                  />
                </div>
                <Helper>If applicable.</Helper>
              </div>

              <div className="md:col-span-4">
                <FieldLabel htmlFor="oneTimeRevenue">One-Time Revenue</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">$</span>
                  <Input
                    id="oneTimeRevenue"
                    inputMode="numeric"
                    value={oneTimeRevenue}
                    onChange={e => setOneTimeRevenue(formatAmountWithCommas(e.target.value))}
                    placeholder="0"
                    className="h-10 pl-7"
                  />
                </div>
                <Helper>If applicable.</Helper>
              </div>

              {/* ── Section 4 — Dates & Status ── */}
              <SectionHeader>Dates &amp; Status</SectionHeader>

              <div className="md:col-span-4">
                <FieldLabel>Projected Close Date <Req /></FieldLabel>
                <DateField value={projectedCloseDate} onChange={setProjectedCloseDate} />
                <Helper>
                  {errors.projectedCloseDate ? (
                    <span className="text-destructive">{errors.projectedCloseDate}</span>
                  ) : (
                    'Used for pipeline forecasting.'
                  )}
                </Helper>
              </div>

              <div className="md:col-span-4">
                <FieldLabel>Contract Start Date</FieldLabel>
                <DateField value={contractStartDate} onChange={setContractStartDate} />
                <Helper />
              </div>

              <div className="md:col-span-4">
                <FieldLabel>Contract End Date</FieldLabel>
                <DateField value={contractEndDate} onChange={setContractEndDate} />
                <Helper>{errors.contractEndDate ? <span className="text-destructive">{errors.contractEndDate}</span> : null}</Helper>
              </div>

              <div className="md:col-span-8">
                <FieldLabel>Deal Stage <Req /></FieldLabel>
                <Select value={dealStage} onValueChange={setDealStage}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Helper>{errors.dealStage ? <span className="text-destructive">{errors.dealStage}</span> : null}</Helper>
              </div>

              <div className="md:col-span-4">
                <FieldLabel htmlFor="onHold">On Hold</FieldLabel>
                <div className="h-10 flex items-center justify-between rounded-md border border-input bg-background px-3">
                  <span className="text-sm text-muted-foreground">{onHold ? 'Yes' : 'No'}</span>
                  <Switch id="onHold" checked={onHold} onCheckedChange={setOnHold} />
                </div>
                <Helper>Preserves stage position while pausing activity.</Helper>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t flex flex-row justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Date field helper ──────────────────────────────────────── */
function DateField({ value, onChange }: { value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full h-10 justify-between text-left font-normal px-3',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{value ? format(value, 'MMM d, yyyy') : 'Pick a date'}</span>
          <CalendarIcon className="ml-2 h-4 w-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}