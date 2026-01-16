import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Flag, Calendar } from 'lucide-react';
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
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDefaultMilestones } from '@/contexts/DefaultMilestonesContext';
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
  const { defaultMilestones } = useDefaultMilestones();
  
  const [internalOpen, setInternalOpen] = useState(false);
  const [confirmBlankOpen, setConfirmBlankOpen] = useState(false);
  const [blankFields, setBlankFields] = useState<string[]>([]);
  const [dealName, setDealName] = useState('');
  const [dealAmount, setDealAmount] = useState('');
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
        engagementType: 'guided',
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Enter the details for the new deal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="dealName">Deal Name</Label>
                <Input
                  id="dealName"
                  value={dealName}
                  onChange={(e) => setDealName(e.target.value)}
                  placeholder="Enter deal name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dealAmount">Deal Amount</Label>
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
              <div className="grid gap-2">
                <Label htmlFor="dealStage">Deal Stage <span className="text-destructive">*</span></Label>
                <Select value={dealStage} onValueChange={setDealStage} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {dealStages.map(stage => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
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
                <div className="grid gap-2">
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
              <div className="grid gap-2">
                <Label htmlFor="contactName">Contact Name <span className="text-destructive">*</span></Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter contact name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactInfo">Contact Info <span className="text-destructive">*</span></Label>
                <Input
                  id="contactInfo"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="Email or phone number"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dealStatusNote">Deal Status <span className="text-destructive">*</span></Label>
                <Input
                  id="dealStatusNote"
                  value={dealStatusNote}
                  onChange={(e) => setDealStatusNote(e.target.value)}
                  placeholder="e.g., Client kickoff call to intro lenders"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="referralName">Referral Source Name</Label>
                  <Input
                    id="referralName"
                    value={referralName}
                    onChange={(e) => setReferralName(e.target.value)}
                    placeholder="e.g., John Smith"
                  />
                </div>
                <div className="grid gap-2">
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
