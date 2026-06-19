import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Flag, Calendar, ChevronDown, ListChecks } from 'lucide-react';
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
import { populateDefaultChecklist } from '@/hooks/useDefaultChecklistConfig';
import { applyDefaultChecklistToOutstandingItems, getChecklistPreview, type ChecklistPreview } from '@/utils/applyDefaultChecklist';
import { useProfile } from '@/hooks/useProfile';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDefaultMilestones } from '@/contexts/DefaultMilestonesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { formatAmountWithCommas, parseAmountToNumber } from '@/utils/currencyFormat';
import { addDays, format } from 'date-fns';
import { DEAL_SOURCED_VIA_OPTIONS } from '@/constants/dealSourcedVia';
import { isOverlayClickSuppressed, shouldIgnoreOverlayOriginEvent } from '@/lib/overlayClickSuppression';
import { useDealInfoFieldOrder } from '@/hooks/useDealInfoFieldOrder';

export interface CreateDealInitialValues {
  dealName?: string;
  dealAmount?: string;
  contactName?: string;
  contactInfo?: string;
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
  const [dealStatusNote, setDealStatusNote] = useState(initialValues?.dealStatusNote || '');
  const [narrative, setNarrative] = useState(initialValues?.narrative || '');
  const [referralName, setReferralName] = useState(initialValues?.referralName || '');
  const [referralEmail, setReferralEmail] = useState(initialValues?.referralEmail || '');
  const [sourcedVia, setSourcedVia] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showMilestonesPreview, setShowMilestonesPreview] = useState(false);
  const [dealTypesOpen, setDealTypesOpen] = useState(false);
  const [showChecklistPreview, setShowChecklistPreview] = useState(false);
  const [checklistPreview, setChecklistPreview] = useState<ChecklistPreview | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

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
    if (showReferral && !referralName.trim()) blank.push('Referral Source Name');
    if (showReferral && !referralEmail.trim()) blank.push('Referral Source Email');
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
    
    if (showClientContact && (!contactName.trim() || !contactInfo.trim())) {
      toast.error('Please fill in contact name and contact info');
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
    setDealStatusNote('');
    setNarrative('');
    setReferralName('');
    setReferralEmail('');
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
        <DialogContent ref={dialogContentRef} className={`${useCarouselSwipeClass()} sm:max-w-[680px] max-h-[90vh] overflow-y-auto border-transparent glass-border-soft shadow-2xl shadow-black/20`}>
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Enter the details for the new deal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3 py-3">
              {/* Row 1: Deal Name + Deal Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="dealName">Deal Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="dealName"
                    value={dealName}
                    onChange={(e) => setDealName(e.target.value)}
                    placeholder="Enter deal name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dealAmount">Deal Amount <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="dealAmount"
                      type="text"
                      inputMode="numeric"
                      value={dealAmount}
                      onChange={handleAmountChange}
                      placeholder="0"
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Deal Type + Deal Stage */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Deal Type <span className="text-destructive">*</span></Label>
                  <Popover modal open={dealTypesOpen} onOpenChange={setDealTypesOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        type="button"
                        className={`w-full justify-between font-normal h-9 ${selectedDealTypes.length === 0 ? 'border-destructive/40' : ''}`}
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
                      container={dialogContentRef.current}
                      className=" w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <Command>
                        <CommandList>
                          {isLoadingDealTypes && availableDealTypes.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              Loading deal types…
                            </div>
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
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
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
                <div className="grid gap-1.5">
                  <Label htmlFor="dealStage">Deal Stage <span className="text-destructive">*</span></Label>
                  <Select value={dealStage} onValueChange={setDealStage} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
                        const stages = selectedPipeline?.stages?.length ? selectedPipeline.stages : effectiveStages;
                        return stages.map(stage => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.label}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pipeline + Sourced Via */}
              <div className={`grid gap-3 ${pipelines.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {pipelines.length > 1 && (
                  <div className="grid gap-1.5">
                    <Label>Pipeline</Label>
                    <Select value={selectedPipelineId} onValueChange={(val) => {
                      setSelectedPipelineId(val);
                      const pipeline = pipelines.find(p => p.id === val);
                      if (pipeline?.stages?.length && !pipeline.stages.find(s => s.id === dealStage)) {
                        setDealStage(pipeline.stages[0]?.id || '');
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>Sourced Via <span className="text-destructive">*</span></Label>
                  <Select value={sourcedVia} onValueChange={setSourcedVia}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start">
                      <SelectItem value="__none__">None</SelectItem>
                      {DEAL_SOURCED_VIA_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: Deal Manager + Deal Owner */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="dealManager">Deal Manager</Label>
                  <Select value={dealManager} onValueChange={setDealManager}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {memberOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dealOwner">Deal Owner</Label>
                  <Select value={dealOwner} onValueChange={setDealOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {memberOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 4: Contact Name + Contact Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="contactName">Contact Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Enter contact name"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="contactInfo">Contact Info <span className="text-destructive">*</span></Label>
                  <Input
                    id="contactInfo"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="Email or phone number"
                    required
                  />
                </div>
              </div>

              {/* Row 5: Deal Status (full width) */}
              <div className="grid gap-1.5">
                <Label htmlFor="dealStatusNote">Deal Status <span className="text-destructive">*</span></Label>
                <Input
                  id="dealStatusNote"
                  value={dealStatusNote}
                  onChange={(e) => setDealStatusNote(e.target.value)}
                  placeholder="e.g., Client kickoff call to intro lenders"
                  required
                />
              </div>

              {/* Deal Narrative */}
              <div className="grid gap-1.5">
                <Label htmlFor="narrative">Deal Narrative</Label>
                <textarea
                  id="narrative"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Summary of the business, business model, what they're looking for, and key financial information..."
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  rows={4}
                />
              </div>

              {/* Row 6: Referral Source (popover) */}
              <div className="grid gap-1.5">
                <Label>Referral Source</Label>
                 <Popover modal>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal"
                      type="button"
                    >
                      <span className={referralName.trim() ? 'text-foreground' : 'text-muted-foreground'}>
                        {referralName.trim()
                          ? `${referralName}${referralEmail.trim() ? ` · ${referralEmail}` : ''}`
                          : 'Add referral source...'}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent container={dialogContentRef.current} className="w-[var(--radix-popover-trigger-width)] p-3 space-y-3" align="start" side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <div className="grid gap-1.5">
                      <Label htmlFor="referralName" className="text-xs">Name</Label>
                      <Input
                        id="referralName"
                        value={referralName}
                        onChange={(e) => setReferralName(e.target.value)}
                        placeholder="e.g., John Smith"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="referralEmail" className="text-xs">Email</Label>
                      <Input
                        id="referralEmail"
                        type="email"
                        value={referralEmail}
                        onChange={(e) => setReferralEmail(e.target.value)}
                        placeholder="e.g., john@example.com"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
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
              {checklistPreview && checklistPreview.items.length > 0 && (
                <Collapsible open={showChecklistPreview} onOpenChange={setShowChecklistPreview}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                       {checklistPreview.items.length} outstanding item{checklistPreview.items.length !== 1 ? 's' : ''} will be added ({checklistPreview.sourceLabel})
                      </span>
                      <span className="text-xs">{showChecklistPreview ? 'Hide' : 'Preview'}</span>
                    </Button>
                  </CollapsibleTrigger>
                  <p className="px-2 text-[11px] text-muted-foreground">
                    Showing Phase 1 initial items. Additional items can be added as the deal progresses.
                  </p>
                  <CollapsibleContent className="mt-2">
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
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
            <DialogFooter className="flex items-center justify-between sm:justify-between">
              {initialValues?.onDismiss ? (
                <Button type="button" variant="ghost" size="sm" onClick={initialValues.onDismiss} className="text-muted-foreground">
                  Dismiss task
                </Button>
              ) : <div />}
              <Button type="submit" variant="gradient" disabled={isCreating || isLoadingFormData}>
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
