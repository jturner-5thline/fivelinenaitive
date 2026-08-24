import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Flag, Calendar, ChevronDown, ListChecks, Building2, User as UserIcon, Search } from 'lucide-react';
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
import { useCarouselSwipeClass } from '@/hooks/useCarouselSwipeClass';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useCompany } from '@/hooks/useCompany';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { useCrmCompanies, useCreateCrmCompany } from '@/hooks/useCrmCompanies';
import { CreateCrmCompanyModal } from '@/components/crm-companies/CreateCrmCompanyModal';
import { populateDefaultChecklist } from '@/hooks/useDefaultChecklistConfig';
import { applyDefaultChecklistToOutstandingItems, getChecklistPreview, type ChecklistPreview } from '@/utils/applyDefaultChecklist';
import { useProfile } from '@/hooks/useProfile';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDefaultMilestones } from '@/contexts/DefaultMilestonesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { formatAmountWithCommas, parseAmountToNumber } from '@/utils/currencyFormat';
import { addDays, format } from 'date-fns';
import { useDealSourcedViaOptions } from '@/hooks/useDealSourcedViaOptions';
import { isOverlayClickSuppressed, shouldIgnoreOverlayOriginEvent } from '@/lib/overlayClickSuppression';
import { useDealInfoFieldOrder } from '@/hooks/useDealInfoFieldOrder';
import type { ContactPickerValue } from '@/components/contacts/ContactPickerField';
import { MultiContactPickerField } from '@/components/contacts/MultiContactPickerField';
import { supabase } from '@/integrations/supabase/client';

export interface CreateDealInitialValues {
  dealName?: string;
  dealAmount?: string;
  contactName?: string;
  contactInfo?: string;
  /** Extra client-contact emails (e.g. other call attendees) prefilled alongside the primary contact */
  additionalContactEmails?: string[];

  dealStatusNote?: string;
  narrative?: string;
  referralName?: string;
  referralEmail?: string;
  dealManager?: string;
  dealOwner?: string;
  dealStage?: string;
  pipelineId?: string;
  dealTypes?: string[];
  dealClass?: 'standard' | 'naitive' | 'finserv';
  /** If provided, called after deal is created successfully (instead of navigating) */
  onCreated?: (dealId: string) => void;
  /** If provided, shows a Dismiss button in the footer */
  onDismiss?: () => void;
}

interface CreateDealDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: CreateDealInitialValues;
}

function LabelWithBadge({
  children,
  htmlFor,
  required,
  badge,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="text-sm">
        {children}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {null}
    </div>
  );
}

const createDealDropdownTriggerClass = 'create-deal-dropdown-trigger rounded-lg h-9';
const createDealDropdownContentClass = 'create-deal-dropdown-content';
const createDealDropdownSurfaceStyle: CSSProperties = {
  backgroundColor: '#060b18',
  backgroundImage: 'linear-gradient(135deg, #0a1224 0%, #060b18 52%, #04060f 100%)',
  border: '1px solid rgba(255, 255, 255, 0.20)',
  color: 'rgba(255, 255, 255, 0.95)',
  boxShadow: '0 18px 44px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.07)',
  backdropFilter: 'none',
};
const createDealDropdownTriggerStyle: CSSProperties = {
  ...createDealDropdownSurfaceStyle,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.35)',
};

export function CreateDealDialog({ trigger, open: controlledOpen, onOpenChange, initialValues }: CreateDealDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createDeal } = useDealsContext();
  const { members, company } = useCompany();
  const { profile } = useProfile();
  const { stages: dealStages, defaultStageId, isLoadingDefault: isLoadingStages } = useDealStages();
  const { dealTypes: availableDealTypes, isLoading: isLoadingDealTypes } = useDealTypes();
  const { defaultMilestones } = useDefaultMilestones();
  const { pipelines, activePipelineId, activePipeline, isLoading: isLoadingPipelines } = usePipelineContext();
  const { isFieldVisible } = useDealInfoFieldOrder();
  // Field-visibility helpers — admins can hide deal-info fields from the
  // settings page; when hidden, they must not appear here either, and
  // their validation must be skipped.
  const showType = isFieldVisible('type');
  const showClientContact = isFieldVisible('clientContact');
  const showSourcedVia = isFieldVisible('sourcedVia');
  const showReferral = isFieldVisible('referralSource');
  const showNarrative = isFieldVisible('narrative');
  const showManager = isFieldVisible('dealManager');
  const showOwner = isFieldVisible('dealOwner');

  // 5th Line account replaces the "Deal Originator" (referral) field on the
  // Create Deal form with an internal "Deal Manager" user select. The Deal
  // Owner field is unchanged.
  const is5thLine = company?.id === FIFTH_LINE_COMPANY_ID;
  
  // Use active pipeline's stages if available, otherwise use global stages
  const effectiveStages = activePipeline?.stages && activePipeline.stages.length > 0 
    ? activePipeline.stages 
    : dealStages;
  
  const [internalOpen, setInternalOpen] = useState(false);
  const [confirmBlankOpen, setConfirmBlankOpen] = useState(false);
  const [blankFields, setBlankFields] = useState<string[]>([]);
  const [dealName, setDealName] = useState(initialValues?.dealName || '');
  const [dealAmount, setDealAmount] = useState(initialValues?.dealAmount || '');
  const [selectedDealTypes, setSelectedDealTypes] = useState<string[]>(initialValues?.dealTypes || []);
  const [selectedPipelineId, setSelectedPipelineId] = useState(initialValues?.pipelineId || activePipelineId || '');
  const [dealStage, setDealStage] = useState(initialValues?.dealStage || defaultStageId || '');
  const [dealManager, setDealManager] = useState(initialValues?.dealManager || '');
  const [dealOwner, setDealOwner] = useState(initialValues?.dealOwner || '');
  const [contactName, setContactName] = useState(initialValues?.contactName || '');
  const [contactInfo, setContactInfo] = useState(initialValues?.contactInfo || '');
  const [clientContacts, setClientContacts] = useState<ContactPickerValue[]>(() => {
    const list: ContactPickerValue[] = [];
    if (initialValues?.contactName || initialValues?.contactInfo) {
      list.push({ name: initialValues?.contactName || '', email: initialValues?.contactInfo || '' });
    }
    for (const email of initialValues?.additionalContactEmails ?? []) {
      const e = (email || '').trim();
      if (e && !list.some((c) => (c.email || '').toLowerCase() === e.toLowerCase())) {
        list.push({ name: '', email: e });
      }
    }
    return list;
  });

  const [dealStatusNote, setDealStatusNote] = useState(initialValues?.dealStatusNote || '');
  const [narrative, setNarrative] = useState(initialValues?.narrative || '');
  const [referralName, setReferralName] = useState(initialValues?.referralName || '');
  const [referralEmail, setReferralEmail] = useState(initialValues?.referralEmail || '');
  const [referralContacts, setReferralContacts] = useState<ContactPickerValue[]>(
    initialValues?.referralName || initialValues?.referralEmail
      ? [{ name: initialValues?.referralName || '', email: initialValues?.referralEmail || '' }]
      : [],
  );
  const [sourcedVia, setSourcedVia] = useState('');
  const { options: sourcedViaOptions } = useDealSourcedViaOptions();
  const [isCreating, setIsCreating] = useState(false);
  const [showMilestonesPreview, setShowMilestonesPreview] = useState(false);
  const [dealTypesOpen, setDealTypesOpen] = useState(false);
  const [showChecklistPreview, setShowChecklistPreview] = useState(false);
  const [checklistPreview, setChecklistPreview] = useState<ChecklistPreview | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  // Visual-only state for the new Company combobox row in the redesigned
  // layout. The submission still uses `dealName` as the company string —
  // this field is presentational and does not change createDeal payloads.
  const [companyNameVisual, setCompanyNameVisual] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const { data: crmCompaniesResult, isLoading: companiesLoading } = useCrmCompanies({ pageSize: 1000 });
  const createCrmCompany = useCreateCrmCompany();
  const crmCompaniesList = crmCompaniesResult?.data ?? [];
  const filteredCrmCompanies = companySearch.trim()
    ? crmCompaniesList.filter((c: any) => c.name?.toLowerCase().includes(companySearch.toLowerCase())).slice(0, 5)
    : crmCompaniesList.slice(0, 5);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  // Sync async-loaded defaults into form state once they resolve.
  // Without this, the form captures `null`/`''` on first render and the
  // submit blocks silently with "Please select a deal stage" on accounts
  // whose company settings load after the dialog mounts.
  useEffect(() => {
    if (!selectedPipelineId && activePipelineId) {
      setSelectedPipelineId(activePipelineId);
    }
  }, [activePipelineId, selectedPipelineId]);

  useEffect(() => {
    if (dealStage) return;
    const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
    const stages = selectedPipeline?.stages?.length
      ? selectedPipeline.stages
      : (dealStages.length ? dealStages : []);
    if (defaultStageId && stages.some(s => s.id === defaultStageId)) {
      setDealStage(defaultStageId);
    } else if (stages.length > 0) {
      setDealStage(stages[0].id);
    }
  }, [defaultStageId, pipelines, selectedPipelineId, dealStages, dealStage]);

  const isLoadingFormData = isLoadingStages || isLoadingPipelines || isLoadingDealTypes;

  // Live-preview the checklist that will be applied as Outstanding Items.
  // Recomputes when the user changes Deal Types — so Fix 2's "X items will
  // be added based on [Deal Type]" wording stays accurate.
  useEffect(() => {
    let cancelled = false;
    if (!company?.id) {
      setChecklistPreview(null);
      return;
    }
    (async () => {
      const p = await getChecklistPreview(company.id, selectedDealTypes);
      if (!cancelled) setChecklistPreview(p);
    })();
    return () => { cancelled = true; };
  }, [company?.id, selectedDealTypes]);

  const sortedMilestones = [...defaultMilestones].sort((a, b) => a.position - b.position);

  const memberOptions = (() => {
    const options = members.map(member => ({
      value: member.user_id,
      label: member.display_name || member.email || member.user_id.slice(0, 8),
    }));
    
    if (user && !options.some(opt => opt.value === user.id)) {
      const currentUserLabel = profile?.display_name || user.email || 'Me';
      options.unshift({
        value: user.id,
        label: currentUserLabel,
      });
    }
    
    return options;
  })();

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAmountWithCommas(e.target.value);
    setDealAmount(formatted);
  };

  const getBlankOptionalFields = () => {
    const blank: string[] = [];
    if (showManager && !dealManager) blank.push('Deal Manager');
    if (showOwner && !dealOwner) blank.push('Deal Owner');
    if (is5thLine) {
      if (!dealManager) blank.push('Deal Manager');
    } else {
      if (showReferral && !referralName.trim()) blank.push('Referral Source Name');
      if (showReferral && !referralEmail.trim()) blank.push('Referral Source Email');
    }
    return blank;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const parsedAmount = parseAmountToNumber(dealAmount);
    if (!dealName.trim() || !parsedAmount) {
      toast.error('Please fill in deal name and amount');
      return;
    }

    if (!dealStage) {
      toast.error('Please select a deal stage');
      return;
    }

    if (showType && selectedDealTypes.length === 0) {
      toast.error('Please select at least one Deal Type');
      return;
    }
    
    if (showClientContact && clientContacts.length === 0) {
      toast.error('Please add at least one client contact');
      return;
    }

    if (!dealStatusNote.trim()) {
      toast.error('Please fill in the deal status');
      return;
    }

    if (showSourcedVia && (!sourcedVia || sourcedVia === '__none__')) {
      toast.error('Please select a source for this deal');
      return;
    }

    const blank = getBlankOptionalFields();
    if (blank.length > 0) {
      setBlankFields(blank);
      setConfirmBlankOpen(true);
      return;
    }

    await createDealFinal();
  };

  const createDealFinal = async () => {
    const parsedAmount = parseAmountToNumber(dealAmount);
    
    const managerName = memberOptions.find(m => m.value === dealManager)?.label || dealManager;
    const ownerName = memberOptions.find(m => m.value === dealOwner)?.label || dealOwner;

    setIsCreating(true);
    try {
      const newDeal = await createDeal({
        company: dealName,
        value: parsedAmount,
        manager: managerName,
        dealOwner: ownerName || undefined,
        contact: contactName.trim(),
        contactInfo: contactInfo.trim(),
        notes: dealStatusNote.trim(),
        narrative: narrative.trim() || undefined,
        status: null,
        stage: dealStage,
        dealTypes: selectedDealTypes.length > 0 ? selectedDealTypes : undefined,
        engagementType: 'advisory',
        sourcedVia: sourcedVia && sourcedVia !== '__none__' ? sourcedVia : undefined,
        pipelineId: selectedPipelineId || activePipelineId || undefined,
        dealClass: initialValues?.dealClass || 'standard',
        referredBy: referralName.trim() ? {
          id: '',
          name: referralName.trim(),
          email: referralEmail.trim() || undefined,
        } : undefined,
      });

      if (newDeal) {
        // Link any additional selected contacts to the new deal via the
        // contact_deals junction so the deal carries the full multi-contact
        // list. The first contact is mirrored into the legacy contact /
        // contactInfo fields above for backward compatibility.
        const linkableIds = clientContacts.map((c) => c.id).filter((id): id is string => !!id);
        if (linkableIds.length > 0) {
          try {
            await supabase
              .from('contact_deals')
              .insert(
                linkableIds.map((contactId) => ({
                  deal_id: newDeal.id,
                  contact_id: contactId,
                })) as any,
              );
          } catch (linkErr) {
            console.warn('[CreateDealDialog] failed to link contacts to deal', linkErr);
          }
        }

        // Populate the data-room (VDR) checklist from the matched deal-type
        // config. This is independent of Outstanding Items and only fires
        // when a deal-type config matches.
        if (selectedDealTypes.length > 0 && user && company?.id) {
          for (const dealType of selectedDealTypes) {
            const count = await populateDefaultChecklist(newDeal.id, dealType, company.id, user.id);
            if (count > 0) break;
          }
        }

        // ALWAYS auto-populate Outstanding Items on deal creation, regardless
        // of pipeline. Resolution: deal-type config → Standard Checklist
        // fallback. (Fix 1 & Fix 2)
        if (user && company?.id) {
          await applyDefaultChecklistToOutstandingItems(
            newDeal.id,
            selectedDealTypes,
            company.id,
            user.id,
          );
        }
        toast.success(`Deal "${dealName}" created successfully!`);
        setOpen(false);
        setConfirmBlankOpen(false);
        resetForm();
        if (initialValues?.onCreated) {
          initialValues.onCreated(newDeal.id);
        } else {
          navigate(`/deal/${newDeal.id}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create deal';
      console.error('[CreateDealDialog] createDeal failed:', error);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setDealName('');
    setDealAmount('');
    setSelectedDealTypes([]);
    setSelectedPipelineId(activePipelineId || '');
    setDealStage(defaultStageId || '');
    setDealManager('');
    setDealOwner('');
    setContactName('');
    setContactInfo('');
    setClientContacts([]);
    setDealStatusNote('');
    setNarrative('');
    setReferralName('');
    setReferralEmail('');
    setReferralContacts([]);
    setSourcedVia('');
    setBlankFields([]);
    setDealTypesOpen(false);
  };

  const handleDealTypeSelect = (typeId: string) => {
    console.log('[CreateDealDialog] Deal Type onSelect fired', typeId);
    setSelectedDealTypes((prev) => (
      prev.includes(typeId)
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId]
    ));
  };

  const defaultTrigger = (
    <Button
      type="button"
      variant="liquid-glass"
      size="sm"
      className="gap-2"
      onPointerDownCapture={(e) => {
        if (shouldIgnoreOverlayOriginEvent(e, e.currentTarget)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClickCapture={(e) => {
        if (shouldIgnoreOverlayOriginEvent(e, e.currentTarget)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <Plus className="h-4 w-4" />
      New Deal
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (nextOpen && isOverlayClickSuppressed()) return;
        setOpen(nextOpen);
      }}>
        <DialogTrigger asChild>
          {trigger || defaultTrigger}
        </DialogTrigger>
        <DialogContent ref={dialogContentRef} className={`${useCarouselSwipeClass()} popup-shell-surface dark sm:max-w-[720px] max-h-[95vh] overflow-y-auto border-transparent glass-border-soft shadow-2xl shadow-black/20 p-4 create-deal-compact text-foreground`}>
          <DialogHeader className="space-y-0 pb-1">
            <DialogTitle className="text-base">Create New Deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-2 py-1">
              {/* Row 1: Deal name | Deal amount */}
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <LabelWithBadge htmlFor="dealName" required>Deal name</LabelWithBadge>
                  <Input
                    id="dealName"
                    value={dealName}
                    onChange={(e) => setDealName(e.target.value)}
                    placeholder="Enter deal name"
                    className="rounded-lg"
                  />
                </div>
                <div className="grid gap-1">
                  <LabelWithBadge htmlFor="dealAmount" required>Deal amount</LabelWithBadge>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="dealAmount"
                      type="text"
                      inputMode="numeric"
                      value={dealAmount}
                      onChange={handleAmountChange}
                      placeholder="0"
                      className="pl-7 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Deal type | Pipeline */}
              <div className="grid grid-cols-2 gap-2">
                {showType ? (
                  <div className="grid gap-1">
                    <LabelWithBadge required>Deal type</LabelWithBadge>
                    <Popover modal open={dealTypesOpen} onOpenChange={setDealTypesOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className={`${createDealDropdownTriggerClass} w-full justify-between font-normal ${selectedDealTypes.length === 0 ? 'border-destructive/40' : ''}`}
                          style={createDealDropdownTriggerStyle}
                        >
                          {selectedDealTypes.length > 0 ? (
                            <span className="flex flex-wrap gap-1 overflow-hidden">
                              {selectedDealTypes.map(typeId => {
                                const typeConfig = availableDealTypes.find(t => t.id === typeId);
                                return typeConfig ? (
                                  <Badge key={typeId} variant="secondary" className="text-xs">
                                    {typeConfig.label}
                                  </Badge>
                                ) : null;
                              })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Select types</span>
                          )}
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        data-create-deal-popover
                        container={dialogContentRef.current}
                        className={`${createDealDropdownContentClass} w-[var(--radix-popover-trigger-width)] p-0`}
                        style={createDealDropdownSurfaceStyle}
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <Command>
                          <CommandList>
                            {isLoadingDealTypes && availableDealTypes.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-muted-foreground">Loading deal types…</div>
                            ) : availableDealTypes.length === 0 ? (
                              <CommandEmpty className="py-3 text-xs text-muted-foreground">
                                No deal types available — contact an admin.
                              </CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {availableDealTypes.map((type) => {
                                  const isSelected = selectedDealTypes.includes(type.id);
                                  return (
                                    <CommandItem
                                      key={type.id}
                                      value={type.label}
                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                      onSelect={() => handleDealTypeSelect(type.id)}
                                      className="gap-2"
                                    >
                                      <Checkbox checked={isSelected} className="pointer-events-none" />
                                      <span>{type.label}</span>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : <div />}
                <div className="grid gap-1">
                  <LabelWithBadge>Pipeline</LabelWithBadge>
                  <Select value={selectedPipelineId} onValueChange={(val) => {
                    setSelectedPipelineId(val);
                    const pipeline = pipelines.find(p => p.id === val);
                    if (pipeline?.stages?.length && !pipeline.stages.find(s => s.id === dealStage)) {
                      setDealStage(pipeline.stages[0]?.id || '');
                    }
                  }}>
                    <SelectTrigger className={createDealDropdownTriggerClass} style={createDealDropdownTriggerStyle}>
                      <SelectValue placeholder="Select pipeline" />
                    </SelectTrigger>
                    <SelectContent data-create-deal-popover className={createDealDropdownContentClass} style={createDealDropdownSurfaceStyle}>
                      {pipelines.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: Deal owner | Deal manager / Deal originator (own user field).
                  Referral source now always lives next to "Sourced via". */}
              <div className="grid grid-cols-2 gap-2">
                {showOwner ? (
                  <div className="grid gap-1">
                    <LabelWithBadge htmlFor="dealOwner" badge="renamed">Deal owner</LabelWithBadge>
                    <Select value={dealOwner} onValueChange={setDealOwner}>
                      <SelectTrigger className={createDealDropdownTriggerClass} style={createDealDropdownTriggerStyle}>
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent data-create-deal-popover className={createDealDropdownContentClass} style={createDealDropdownSurfaceStyle}>
                        {memberOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : <div />}
                {showManager ? (
                  <div className="grid gap-1">
                    <LabelWithBadge htmlFor="dealManager">{is5thLine ? 'Deal Manager' : 'Deal originator'}</LabelWithBadge>
                    <Select value={dealManager} onValueChange={setDealManager}>
                      <SelectTrigger className={createDealDropdownTriggerClass} style={createDealDropdownTriggerStyle}>
                        <SelectValue placeholder={is5thLine ? 'Select manager' : 'Select originator'} />
                      </SelectTrigger>
                      <SelectContent data-create-deal-popover className={createDealDropdownContentClass} style={createDealDropdownSurfaceStyle}>
                        {memberOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : <div />}
              </div>


              {/* Row 4: Deal stage | Deal status */}
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <LabelWithBadge htmlFor="dealStage" required badge="grouped">Deal stage</LabelWithBadge>
                  <Select value={dealStage} onValueChange={setDealStage} required>
                    <SelectTrigger className={createDealDropdownTriggerClass} style={createDealDropdownTriggerStyle}>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent data-create-deal-popover className={createDealDropdownContentClass} style={createDealDropdownSurfaceStyle}>
                      {(() => {
                        const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
                        const stages = selectedPipeline?.stages?.length ? selectedPipeline.stages : effectiveStages;
                        return stages.map(stage => (
                          <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <LabelWithBadge htmlFor="dealStatusNote" required badge="grouped">Deal status</LabelWithBadge>
                  <Input
                    id="dealStatusNote"
                    value={dealStatusNote}
                    onChange={(e) => setDealStatusNote(e.target.value)}
                    placeholder="e.g., Client kickoff call to intro lenders"
                    className="rounded-lg"
                    required
                  />
                </div>
              </div>

              {/* Row 5: Deal narrative (full width) */}
              {showNarrative && (
                <div className="grid gap-1">
                  <LabelWithBadge htmlFor="narrative">Deal narrative</LabelWithBadge>
                  <textarea
                    id="narrative"
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    placeholder="Summary of the business, business model, what they're looking for, and key financial information..."
                    className="flex min-h-[100px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    rows={4}
                  />
                </div>
              )}

              {/* Row 6: Company name | Contact name */}
              <div className="grid grid-cols-2 gap-2">
                 <div className="grid gap-1">
                   <LabelWithBadge badge="new">Company name</LabelWithBadge>
                   <Button
                     variant="outline"
                     type="button"
                     onClick={() => setCompanyPickerOpen(true)}
                     className={`${createDealDropdownTriggerClass} w-full justify-between font-normal`}
                     style={createDealDropdownTriggerStyle}
                   >
                     <span className="flex items-center gap-2 min-w-0">
                       <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                       <span className={`truncate ${companyNameVisual ? 'text-foreground' : 'text-muted-foreground'}`}>
                         {companyNameVisual || 'New company name…'}
                       </span>
                     </span>
                     <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                   </Button>
                   <Dialog open={companyPickerOpen} onOpenChange={(o) => { setCompanyPickerOpen(o); if (!o) setCompanySearch(''); }}>
                     <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden popup-shell-surface dark text-foreground border-white/10">
                       <DialogHeader className="px-4 pt-4 pb-2">
                         <DialogTitle>Select or add a company</DialogTitle>
                       </DialogHeader>
                       <div className="border-b border-white/10 px-4 pb-3">
                         <div className="relative">
                           <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                           <Input
                             placeholder="Search companies…"
                             value={companySearch}
                             onChange={(e) => setCompanySearch(e.target.value)}
                             className="h-9 pl-8"
                             autoFocus
                           />
                         </div>
                       </div>
                       <div className="max-h-[320px] overflow-y-auto py-1">
                         {filteredCrmCompanies.length === 0 && (
                           <p className="px-3 py-6 text-xs text-muted-foreground text-center">
                             {companiesLoading ? 'Loading…' : 'No companies found'}
                           </p>
                         )}
                         {filteredCrmCompanies.map((c: any) => {
                           const initials = c.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                           return (
                             <button
                               key={c.id}
                               type="button"
                               className="flex w-full items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-accent"
                               onClick={() => {
                                 setCompanyNameVisual(c.name);
                                 if (!dealName.trim()) setDealName(c.name);
                                 setCompanyPickerOpen(false);
                                 setCompanySearch('');
                               }}
                             >
                               <span className="flex items-center gap-2 min-w-0">
                                 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                                   {initials}
                                 </span>
                                 <span className="truncate">{c.name}</span>
                               </span>
                               {c.industry && (
                                 <span className="text-xs text-muted-foreground whitespace-nowrap">{c.industry}</span>
                               )}
                             </button>
                           );
                         })}
                         {companySearch.trim() && !filteredCrmCompanies.some((c: any) => c.name.toLowerCase() === companySearch.trim().toLowerCase()) && (
                           <button
                             type="button"
                             disabled={createCrmCompany.isPending}
                             className="flex w-full items-center gap-2 border-t border-white/10 px-4 py-3 text-sm text-primary hover:bg-accent"
                            onClick={() => {
                              setNewCompanyName(companySearch.trim());
                              setCreateCompanyOpen(true);
                            }}
                           >
                             <Plus className="h-4 w-4" />
                             {createCrmCompany.isPending ? 'Adding…' : `Add "${companySearch.trim()}" as new company`}
                           </button>
                         )}
                       </div>
                     </DialogContent>
                   </Dialog>
                  <CreateCrmCompanyModal
                    open={createCompanyOpen}
                    initialName={newCompanyName}
                    onClose={() => setCreateCompanyOpen(false)}
                    onCreated={(created) => {
                      const name = created?.name || newCompanyName;
                      setCompanyNameVisual(name);
                      if (!dealName.trim()) setDealName(name);
                      setCreateCompanyOpen(false);
                      setCompanyPickerOpen(false);
                      setCompanySearch('');
                      toast.success(`Added "${name}" to companies`);
                    }}
                  />
                 </div>
                {showClientContact ? (
                  <div className="grid gap-1">
                    <LabelWithBadge htmlFor="clientContact" required badge="merged">Contact name</LabelWithBadge>
                    <div className="relative">
                      <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      <div className="[&_input]:pl-8 [&_button]:pl-8">
                        <MultiContactPickerField
                          id="clientContact"
                          value={clientContacts}
                          onChange={(list) => {
                            setClientContacts(list);
                            const first = list[0];
                            setContactName(first?.name || '');
                            setContactInfo(first?.email || '');
                          }}
                          placeholder=""
                          invalid={false}
                        />
                      </div>
                    </div>
                  </div>
                ) : <div />}
              </div>

              {/* Row 7: Sourced via | (right side reserved for checklist preview in footer) */}
              <div className="grid grid-cols-2 gap-2">
                {showSourcedVia ? (
                  <div className="grid gap-1">
                    <LabelWithBadge required badge="moved">Sourced via</LabelWithBadge>
                    <Select value={sourcedVia} onValueChange={setSourcedVia}>
                      <SelectTrigger className={createDealDropdownTriggerClass} style={createDealDropdownTriggerStyle}>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent data-create-deal-popover className={createDealDropdownContentClass} style={createDealDropdownSurfaceStyle} side="bottom" align="start">
                        <SelectItem value="__none__">None</SelectItem>
                        {sourcedViaOptions.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : <div />}
                {showReferral ? (
                  <div className="grid gap-1">
                    <LabelWithBadge>Referral source</LabelWithBadge>
                    <MultiContactPickerField
                      id="referralContact"
                      value={referralContacts}
                      onChange={(list) => {
                        const one = list.slice(-1);
                        setReferralContacts(one);
                        const first = one[0];
                        setReferralName(first?.name || '');
                        setReferralEmail(first?.email || '');
                      }}
                      placeholder="Select referral source (optional)"
                      dialogTitle="Select referral source"
                      dialogDescription="Pick a contact from the Contacts database or create a new one."
                      addButtonLabel="Select referral"
                      className={createDealDropdownTriggerClass}
                    />
                  </div>
                ) : <div />}
              </div>

              {sortedMilestones.length > 0 && (
                <Collapsible open={showMilestonesPreview} onOpenChange={setShowMilestonesPreview}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Flag className="h-4 w-4" />
                        {sortedMilestones.length} default milestone{sortedMilestones.length !== 1 ? 's' : ''} will be added
                      </span>
                      <span className="text-xs">{showMilestonesPreview ? 'Hide' : 'Show'}</span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      {sortedMilestones.map((milestone) => (
                        <div key={milestone.id} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{milestone.title}</span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {milestone.daysFromCreation !== null 
                              ? format(addDays(new Date(), milestone.daysFromCreation), 'MMM d, yyyy')
                              : 'No date'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
              {checklistPreview && checklistPreview.items.length > 0 && showChecklistPreview && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 max-h-56 overflow-y-auto">
                  {checklistPreview.items.map((it, idx) => (
                    <div key={`${it.label}-${idx}`} className="flex items-center justify-between text-sm gap-3">
                      <span className="font-medium truncate">{it.label}</span>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {it.category || ''}{it.required ? (it.category ? ' · Required' : 'Required') : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="flex items-center justify-between sm:justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                {checklistPreview && checklistPreview.items.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowChecklistPreview((v) => !v)}
                      className="text-primary hover:underline"
                    >
                      {showChecklistPreview ? 'Hide' : 'Preview'}
                    </button>
                    <span className="flex items-center gap-1.5 truncate">
                      <ListChecks className="h-3.5 w-3.5" />
                      <span className="truncate">…Checklist – Phase 1</span>
                    </span>
                  </>
                ) : initialValues?.onDismiss ? (
                  <Button type="button" variant="ghost" size="sm" onClick={initialValues.onDismiss} className="text-muted-foreground">
                    Dismiss task
                  </Button>
                ) : <span />}
              </div>
              <Button type="submit" variant="liquid-glass" size="sm" className="gap-2" disabled={isCreating || isLoadingFormData}>
                {isCreating ? 'Creating...' : isLoadingFormData ? 'Loading…' : 'Create Deal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={confirmBlankOpen} onOpenChange={setConfirmBlankOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm blank fields</AlertDialogTitle>
            <AlertDialogDescription>
              The following optional fields are blank:
              <ul className="list-disc list-inside mt-2 space-y-1">
                {blankFields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <p className="mt-3">Are you sure you want to create this deal without filling in these fields?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={createDealFinal} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Yes, Create Deal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
