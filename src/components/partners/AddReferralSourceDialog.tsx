import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useCreateReferralSource, useUpdateReferralSource, useDeleteReferralSource, type ReferralSourceRecord } from '@/hooks/useReferralSourcesPipeline';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editSource?: ReferralSourceRecord | null;
}

export function AddReferralSourceDialog({ open, onOpenChange, editSource }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState('Other');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const teamMembers = useTeamMembers();
  const create = useCreateReferralSource();
  const update = useUpdateReferralSource();
  const del = useDeleteReferralSource();

  useEffect(() => {
    if (editSource) {
      setName(editSource.name);
      setType(editSource.type);
      setContactName(editSource.contact_name || '');
      setContactEmail(editSource.contact_email || '');
      setNotes(editSource.notes || '');
      setOwnerId(editSource.relationship_owner_id || '');
    } else {
      setName(''); setType('Other'); setContactName(''); setContactEmail(''); setNotes(''); setOwnerId('');
    }
  }, [editSource, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    const values = {
      name: name.trim(),
      type,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      notes: notes || null,
      relationship_owner_id: ownerId || null,
    };
    if (editSource) {
      update.mutate({ id: editSource.id, ...values }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(values as any, { onSuccess: () => onOpenChange(false) });
    }
  };

  const handleDelete = () => {
    if (editSource) {
      del.mutate(editSource.id, { onSuccess: () => { setShowDelete(false); onOpenChange(false); } });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editSource ? 'Edit Referral Source' : 'Add Referral Source'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name or firm name" />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Firm">Firm</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Smith" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="john@example.com" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Relationship Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={3} />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            {editSource && (
              <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} className="mr-auto">
                Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!name.trim()}>
                {editSource ? 'Save Changes' : 'Add'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete referral source?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove "{editSource?.name}" from your referral sources.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
