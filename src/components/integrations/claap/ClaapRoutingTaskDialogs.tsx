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
// Deal Creation Dialog
// ============================================
export function DealCreationDialog({ task, open, onOpenChange }: {
  task: ClaapRoutingTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolveTask = useClaapResolveTask();
  const dismissTask = useClaapDismissTask();
  const { stages } = useDealStages();

  const [dealName, setDealName] = useState(task.prefilled_data?.suggested_name || '');
  const [dealStage, setDealStage] = useState('');
  const [dealOwner, setDealOwner] = useState('');

  const handleConfirm = async () => {
    if (!dealName.trim()) { toast.error('Deal name is required'); return; }
    if (!dealStage) { toast.error('Deal stage is required'); return; }

    // TODO: Create deal via DealsContext
    resolveTask.mutate(
      {
        taskId: task.id,
        resolvedData: {
          deal_name: dealName,
          deal_stage: dealStage,
          deal_owner: dealOwner,
          company_id: task.prefilled_data?.company_id,
          organizer_user_id: task.prefilled_data?.organizer_user_id,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Deal "${dealName}" created`);
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
            <Briefcase className="h-5 w-5 text-primary" />
            Create Deal from Meeting
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This meeting matches a financing review pattern. Review and create a deal.
        </p>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Deal Name</Label>
            <Input value={dealName} onChange={e => setDealName(e.target.value)} />
          </div>
          {task.prefilled_data?.company_name && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>Company: <strong>{task.prefilled_data.company_name}</strong></span>
            </div>
          )}
          <div className="space-y-2">
            <Label>Deal Stage <span className="text-destructive">*</span></Label>
            <Select value={dealStage} onValueChange={setDealStage}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deal Manager</Label>
            <Input value={task.prefilled_data?.organizer_email || ''} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Auto-set to meeting organizer</p>
          </div>
          <div className="space-y-2">
            <Label>Deal Owner <span className="text-destructive">*</span></Label>
            <Input value={dealOwner} onChange={e => setDealOwner(e.target.value)} placeholder="Enter deal owner name" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { dismissTask.mutate(task.id); onOpenChange(false); }}>Dismiss</Button>
          <Button onClick={handleConfirm} disabled={resolveTask.isPending}>Create Deal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
