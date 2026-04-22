import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, ChevronDown, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  { id: 'fs-qualification', label: 'Qualification' },
  { id: 'fs-discovery', label: 'Discovery (first substantive conversation)' },
  { id: 'fs-qualified', label: 'Qualified (confirmed fit, moving toward scope)' },
  { id: 'fs-scoping', label: 'Scoping' },
  { id: 'fs-proposal-sent', label: 'Proposal Sent' },
  { id: 'fs-negotiation', label: 'Negotiation' },
  { id: 'fs-closed-won', label: 'Closed Won' },
  { id: 'fs-closed-lost', label: 'Closed Lost' },
];
export const FINSERV_OWNERS = ['Scott Williams', 'Siddhi Bhangale', 'Kris Lawless'] as const;

/* ─── Validation schema ──────────────────────────────────────── */
const formSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company Name is required').max(120),
    primaryContact: z.string().trim().min(1, 'Primary Contact is required').max(120),
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
        stage: data.dealStage,
        deal_owner: data.dealOwner,
        pipeline_id: pipelineId || null,
        company_id: FIFTH_LINE_COMPANY_ID,
        deal_class: 'finserv',
        engagement_type: 'guided',
        status: 'on-track',
        user_id: user.id,
        value: 0,
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

  const FieldError = ({ name }: { name: keyof FormErrors }) =>
    errors[name] ? <p className="text-xs text-destructive mt-1">{errors[name]}</p> : null;

  const Req = () => <span className="text-destructive">*</span>;

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle>Create New Deal</DialogTitle>
          <DialogDescription>Add a deal to the FinServ pipeline.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Company Name */}
              <div className="grid gap-1.5">
                <Label htmlFor="companyName">Company Name <Req /></Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  maxLength={120}
                  placeholder="Enter company name"
                />
                <FieldError name="companyName" />
              </div>

              {/* 2. Primary Contact */}
              <div className="grid gap-1.5">
                <Label htmlFor="primaryContact">Primary Contact <Req /></Label>
                <Input
                  id="primaryContact"
                  value={primaryContact}
                  onChange={e => setPrimaryContact(e.target.value)}
                  maxLength={120}
                  placeholder="e.g., Jane Doe"
                />
                <p className="text-xs text-muted-foreground">
                  Name of the key person at the company (not just the company itself).
                </p>
                <FieldError name="primaryContact" />
              </div>

              {/* 3. Lead Source */}
              <div className="grid gap-1.5">
                <Label>Lead Source <Req /></Label>
                <Select value={leadSource} onValueChange={setLeadSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead source" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError name="leadSource" />
              </div>

              {/* 4. Referral Source */}
              <div className="grid gap-1.5">
                <Label htmlFor="referralSource">
                  Referral Source {leadSource === 'Referral' && <Req />}
                </Label>
                <Input
                  id="referralSource"
                  value={referralSource}
                  onChange={e => setReferralSource(e.target.value)}
                  maxLength={200}
                  placeholder="Who referred this opportunity"
                  disabled={leadSource !== '' && leadSource !== 'Referral' ? false : false}
                />
                <p className="text-xs text-muted-foreground">Who specifically referred this opportunity.</p>
                <FieldError name="referralSource" />
              </div>

              {/* 5. Opportunity Type */}
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Opportunity Type <Req /></Label>
                <Select value={opportunityType} onValueChange={setOpportunityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select opportunity type" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPPORTUNITY_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError name="opportunityType" />
              </div>

              {/* 6. Services Offered (multi-chip) */}
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Services Offered <Req /></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal h-auto min-h-9 py-1.5"
                    >
                      {servicesOffered.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {servicesOffered.map(s => (
                            <Badge key={s} variant="secondary" className="text-xs gap-1">
                              {s}
                              <X
                                className="h-3 w-3 cursor-pointer hover:text-destructive"
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleService(s);
                                }}
                              />
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Select services</span>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-2" align="start">
                    <div className="space-y-1">
                      {SERVICES.map(svc => {
                        const checked = servicesOffered.includes(svc);
                        return (
                          <button
                            key={svc}
                            type="button"
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 text-left"
                            onClick={() => toggleService(svc)}
                          >
                            <Checkbox checked={checked} className="pointer-events-none" />
                            {svc}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <FieldError name="servicesOffered" />
              </div>

              {/* 7. Fee Type */}
              <div className="grid gap-1.5">
                <Label>Fee Type <Req /></Label>
                <Select value={feeType} onValueChange={setFeeType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select fee type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_TYPES.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError name="feeType" />
              </div>

              {/* spacer to keep grid aligned */}
              <div className="hidden md:block" />

              {/* 8. MRR */}
              <div className="grid gap-1.5">
                <Label htmlFor="mrr">Monthly Recurring Revenue</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="mrr"
                    inputMode="numeric"
                    value={mrr}
                    onChange={e => setMrr(formatAmountWithCommas(e.target.value))}
                    placeholder="0"
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">If applicable.</p>
              </div>

              {/* 9. One-Time Revenue */}
              <div className="grid gap-1.5">
                <Label htmlFor="oneTimeRevenue">One-Time Revenue</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="oneTimeRevenue"
                    inputMode="numeric"
                    value={oneTimeRevenue}
                    onChange={e => setOneTimeRevenue(formatAmountWithCommas(e.target.value))}
                    placeholder="0"
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">If applicable.</p>
              </div>

              {/* 10. Projected Close Date */}
              <div className="grid gap-1.5">
                <Label>Projected Close Date <Req /></Label>
                <DateField value={projectedCloseDate} onChange={setProjectedCloseDate} />
                <p className="text-xs text-muted-foreground">
                  Expected date deal moves to Closed Won or Lost — used for pipeline forecasting.
                </p>
                <FieldError name="projectedCloseDate" />
              </div>

              {/* spacer */}
              <div className="hidden md:block" />

              {/* 11. Contract Start Date */}
              <div className="grid gap-1.5">
                <Label>Contract Start Date</Label>
                <DateField value={contractStartDate} onChange={setContractStartDate} />
              </div>

              {/* 12. Contract End Date */}
              <div className="grid gap-1.5">
                <Label>Contract End Date</Label>
                <DateField value={contractEndDate} onChange={setContractEndDate} />
                <FieldError name="contractEndDate" />
              </div>

              {/* 13. Deal Stage */}
              <div className="grid gap-1.5">
                <Label>Deal Stage <Req /></Label>
                <Select value={dealStage} onValueChange={setDealStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError name="dealStage" />
              </div>

              {/* 14. On Hold */}
              <div className="grid gap-1.5">
                <Label htmlFor="onHold">On Hold</Label>
                <div className="flex items-center gap-3 h-9">
                  <Switch id="onHold" checked={onHold} onCheckedChange={setOnHold} />
                  <span className="text-sm text-muted-foreground">{onHold ? 'Yes' : 'No'}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Can be set at any stage; preserves stage position while pausing activity.
                </p>
              </div>

              {/* 15. Deal Owner */}
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Deal Owner <Req /></Label>
                <Select value={dealOwner} onValueChange={setDealOwner}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINSERV_OWNERS.map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError name="dealOwner" />
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
          className={cn('w-full justify-start text-left font-normal h-9', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'PPP') : <span>Pick a date</span>}
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