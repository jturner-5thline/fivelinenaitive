import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { User, Building2, Mail, Globe, Briefcase, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClaapResolveTask, useClaapDismissTask, ClaapRoutingTask } from '@/hooks/useClaapMeetings';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { CreateDealDialog, CreateDealInitialValues } from '@/components/deals/CreateDealDialog';

// ============================================
// Contact Confirmation Dialog
// ============================================
export function ContactConfirmationDialog({ task, open, onOpenChange }: {
  task: ClaapRoutingTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolveTask = useClaapResolveTask();
  const dismissTask = useClaapDismissTask();
  const participants = (task.prefilled_data?.participants || []) as Array<{
    name: string; email: string; domain: string; suggested_company: string;
  }>;

  const [editedParticipants, setEditedParticipants] = useState(
    participants.map(p => ({ ...p, company_name: p.suggested_company || '' }))
  );

  const handleConfirm = async () => {
    try {
      // Create profiles for unresolved contacts (TODO: wire to actual contact creation API)
      // For now just resolve the task with the data
      resolveTask.mutate(
        { taskId: task.id, resolvedData: { contacts: editedParticipants } },
        {
          onSuccess: () => {
            toast.success('Contacts confirmed');
            onOpenChange(false);
          },
        }
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm contacts');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Confirm New Contacts
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The following participants from a Claap meeting were not found in your contacts. Review and confirm to create them.
        </p>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {editedParticipants.map((participant, i) => (
            <Card key={i}>
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={participant.name || ''}
                    onChange={e => {
                      const updated = [...editedParticipants];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setEditedParticipants(updated);
                    }}
                    placeholder="Name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{participant.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{participant.domain}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={participant.company_name}
                    onChange={e => {
                      const updated = [...editedParticipants];
                      updated[i] = { ...updated[i], company_name: e.target.value };
                      setEditedParticipants(updated);
                    }}
                    placeholder="Company name"
                    className="h-8 text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            dismissTask.mutate(task.id);
            onOpenChange(false);
          }}>
            Dismiss
          </Button>
          <Button onClick={handleConfirm} disabled={resolveTask.isPending}>
            Confirm & Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Company Confirmation Dialog
// ============================================
export function CompanyConfirmationDialog({ task, open, onOpenChange }: {
  task: ClaapRoutingTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolveTask = useClaapResolveTask();
  const dismissTask = useClaapDismissTask();
  const [companyName, setCompanyName] = useState(task.prefilled_data?.suggested_name || '');
  const domains = (task.prefilled_data?.domains || []) as string[];

  const handleConfirm = async () => {
    if (!companyName.trim()) { toast.error('Company name is required'); return; }

    // TODO: Create company via API
    resolveTask.mutate(
      { taskId: task.id, resolvedData: { company_name: companyName, domains } },
      {
        onSuccess: () => {
          toast.success(`Company "${companyName}" created`);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Confirm New Company
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A Claap meeting had participants from an unrecognized domain. Confirm to create a company record.
        </p>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Domain(s)</Label>
            <div className="flex flex-wrap gap-1">
              {domains.map(d => (
                <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { dismissTask.mutate(task.id); onOpenChange(false); }}>Dismiss</Button>
          <Button onClick={handleConfirm} disabled={resolveTask.isPending}>Confirm & Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Deal Creation Dialog — reuses the real CreateDealDialog
// ============================================
export function DealCreationDialog({ task, open, onOpenChange }: {
  task: ClaapRoutingTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolveTask = useClaapResolveTask();
  const dismissTask = useClaapDismissTask();

  const prefilled = task.prefilled_data || {};
  
  // Build contacts info from prefilled data
  const contacts = (prefilled.contacts || []) as Array<{ name?: string; email?: string }>;
  const primaryContact = contacts[0];

  const initialValues: CreateDealInitialValues = {
    dealName: prefilled.suggested_name || '',
    contactName: primaryContact?.name || '',
    contactInfo: primaryContact?.email || '',
    // These will be extracted from transcript by the webhook AI analysis
    dealAmount: prefilled.suggested_amount || '',
    dealStatusNote: prefilled.suggested_status || '',
    referralName: prefilled.referral_name || '',
    referralEmail: prefilled.referral_email || '',
    onCreated: (dealId: string) => {
      // Resolve the routing task with the new deal id
      resolveTask.mutate(
        {
          taskId: task.id,
          resolvedData: {
            deal_id: dealId,
            company_id: prefilled.company_id,
            organizer_user_id: prefilled.organizer_user_id,
          },
        },
        {
          onSuccess: () => {
            // Also link the meeting to the new deal
            supabase
              .from('claap_meetings')
              .update({ deal_id: dealId, status: 'routed' } as any)
              .eq('id', task.meeting_id)
              .then();
          },
        }
      );
    },
  };

  if (!open) return null;

  return (
    <CreateDealDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          // If dialog closed without creating, offer dismiss option
          onOpenChange(false);
        }
      }}
      initialValues={initialValues}
    />
  );
}

// ============================================
// Deal Disambiguation Dialog
// ============================================
export function DealDisambiguationDialog({ task, open, onOpenChange }: {
  task: ClaapRoutingTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolveTask = useClaapResolveTask();
  const dismissTask = useClaapDismissTask();
  const { deals } = useDealsContext();
  const dealIds = (task.prefilled_data?.deal_ids || []) as string[];
  const candidateDeals = deals.filter(d => dealIds.includes(d.id));
  const [selectedDealId, setSelectedDealId] = useState('');

  const handleConfirm = () => {
    if (!selectedDealId) { toast.error('Please select a deal'); return; }
    resolveTask.mutate(
      { taskId: task.id, resolvedData: { deal_id: selectedDealId } },
      {
        onSuccess: () => {
          toast.success('Meeting attached to deal');
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Multiple Active Deals Found
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Multiple active deals were found for {task.prefilled_data?.company_name || 'this company'}. Select which deal this meeting belongs to.
        </p>
        <div className="space-y-2">
          {candidateDeals.map(deal => (
            <Card
              key={deal.id}
              className={`cursor-pointer transition-colors ${selectedDealId === deal.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              onClick={() => setSelectedDealId(deal.id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{deal.company}</p>
                    <p className="text-xs text-muted-foreground">{(deal as any).deal_name || 'No deal name'}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{deal.stage}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {candidateDeals.length === 0 && dealIds.length > 0 && (
            <p className="text-sm text-muted-foreground italic">Deal candidates could not be loaded. IDs: {dealIds.join(', ')}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { dismissTask.mutate(task.id); onOpenChange(false); }}>Dismiss</Button>
          <Button onClick={handleConfirm} disabled={!selectedDealId || resolveTask.isPending}>Attach to Deal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
