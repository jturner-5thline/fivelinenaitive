import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Flag, Calendar, ChevronDown } from 'lucide-react';
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
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDefaultMilestones } from '@/contexts/DefaultMilestonesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { formatAmountWithCommas, parseAmountToNumber } from '@/utils/currencyFormat';
import { addDays, format } from 'date-fns';

interface CreateDealDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateDealDialog({ trigger, open: controlledOpen, onOpenChange }: CreateDealDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createDeal } = useDealsContext();
  const { members } = useCompany();
  const { profile } = useProfile();
  const { stages: dealStages, defaultStageId } = useDealStages();
  const { dealTypes: availableDealTypes } = useDealTypes();
  const { defaultMilestones } = useDefaultMilestones();
  const { pipelines, activePipelineId, activePipeline } = usePipelineContext();
  
  // Use active pipeline's stages if available, otherwise use global stages
  const effectiveStages = activePipeline?.stages && activePipeline.stages.length > 0 
    ? activePipeline.stages 
    : dealStages;
  
  const [internalOpen, setInternalOpen] = useState(false);
  const [confirmBlankOpen, setConfirmBlankOpen] = useState(false);
  const [blankFields, setBlankFields] = useState<string[]>([]);
  const [dealName, setDealName] = useState('');
  const [dealAmount, setDealAmount] = useState('');
  const [selectedDealTypes, setSelectedDealTypes] = useState<string[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState(activePipelineId || '');
  const [dealStage, setDealStage] = useState(defaultStageId || '');
  const [dealManager, setDealManager] = useState('');
  const [dealOwner, setDealOwner] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [dealStatusNote, setDealStatusNote] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralEmail, setReferralEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showMilestonesPreview, setShowMilestonesPreview] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

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
    if (!dealManager) blank.push('Deal Manager');
    if (!dealOwner) blank.push('Deal Owner');
    if (!referralName.trim()) blank.push('Referral Source Name');
    if (!referralEmail.trim()) blank.push('Referral Source Email');
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
    
    if (!contactName.trim() || !contactInfo.trim()) {
      toast.error('Please fill in contact name and contact info');
      return;
    }

    if (!dealStatusNote.trim()) {
      toast.error('Please fill in the deal status');
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
        status: 'on-track',
        stage: dealStage,
        dealTypes: selectedDealTypes.length > 0 ? selectedDealTypes : undefined,
        engagementType: 'guided',
        pipelineId: selectedPipelineId || activePipelineId || undefined,
        referredBy: referralName.trim() ? {
          id: '',
          name: referralName.trim(),
          email: referralEmail.trim() || undefined,
        } : undefined,
      });

      if (newDeal) {
        toast.success(`Deal "${dealName}" created successfully!`);
        setOpen(false);
        setConfirmBlankOpen(false);
        resetForm();
        navigate(`/deal/${newDeal.id}`);
      }
    } catch (error) {
      toast.error('Failed to create deal');
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
    setReferralName('');
    setReferralEmail('');
    setBlankFields([]);
  };

  const defaultTrigger = (
    <Button variant="gradient" size="sm" className="gap-2">
      <Plus className="h-4 w-4" />
      New Deal
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || defaultTrigger}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
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
                  <Label>Deal Type</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal h-9">
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
                    <PopoverContent className="w-full p-2" align="start">
                      <div className="space-y-1">
                        {availableDealTypes.map((type) => {
                          const isSelected = selectedDealTypes.includes(type.id);
                          return (
                            <button
                              key={type.id}
                              type="button"
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 text-left"
                              onClick={() => {
                                setSelectedDealTypes(prev => 
                                  isSelected
                                    ? prev.filter(t => t !== type.id)
                                    : [...prev, type.id]
                                );
                              }}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none" />
                              {type.label}
                            </button>
                          );
                        })}
                      </div>
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

              {/* Pipeline (conditional) */}
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

              {/* Row 6: Referral Source Name + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="referralName">Referral Source Name</Label>
                  <Input
                    id="referralName"
                    value={referralName}
                    onChange={(e) => setReferralName(e.target.value)}
                    placeholder="e.g., John Smith"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="referralEmail">Referral Source Email</Label>
                  <Input
                    id="referralEmail"
                    type="email"
                    value={referralEmail}
                    onChange={(e) => setReferralEmail(e.target.value)}
                    placeholder="e.g., john@example.com"
                  />
                </div>
              </div>
              {sortedMilestones.length > 0 && (
                <Collapsible open={showMilestonesPreview} onOpenChange={setShowMilestonesPreview}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
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
                            {format(addDays(new Date(), milestone.daysFromCreation), 'MMM d, yyyy')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" variant="gradient" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Deal'}
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
