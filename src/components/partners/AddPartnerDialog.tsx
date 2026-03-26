import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePipelineStages, useCreatePartner } from '@/hooks/usePartnersPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';

const FIRM_TYPES = ['Investment Bank', 'Broker', 'Advisor', 'Lender', 'Strategic', 'Other'];

export function AddPartnerDialog({ open, onOpenChange, defaultStageId }: { open: boolean; onOpenChange: (v: boolean) => void; defaultStageId: string | null }) {
  const { data: stages = [] } = usePipelineStages();
  const teamMembers = useTeamMembers();
  const create = useCreatePartner();

  const [name, setName] = useState('');
  const [firmType, setFirmType] = useState('Other');
  const [stageId, setStageId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setFirmType('Other');
      setStageId(defaultStageId || stages[0]?.id || '');
      setOwnerId('');
      setNotes('');
    }
  }, [open, defaultStageId, stages]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    create.mutate({
      name: name.trim(),
      firm_type: firmType,
      stage_id: stageId || null,
      owner_id: ownerId || null,
      notes,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Partner</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Partner Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Apex Capital Partners" />
          </div>
          <div className="space-y-1.5">
            <Label>Firm Type</Label>
            <Select value={firmType} onValueChange={setFirmType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIRM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pipeline Stage</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Relationship Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || create.isPending}>Add Partner</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
