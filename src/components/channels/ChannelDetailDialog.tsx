import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Building2, User, Mail, Phone, Trash2, Loader2 } from 'lucide-react';
import { useUpdateChannelEntry, useDeleteChannelEntry, type ChannelType, type ChannelEntry } from '@/hooks/useChannelEntries';
import { CHANNEL_TYPE_OPTIONS } from './channelOptions';

const CHANNEL_TYPES: ChannelType[] = CHANNEL_TYPE_OPTIONS.map(o => o.value);

interface Props {
  entry: ChannelEntry;
  onClose: () => void;
}

export function ChannelDetailDialog({ entry, onClose }: Props) {
  const [channelType, setChannelType] = useState<ChannelType>(entry.channel_type);
  const [notes, setNotes] = useState(entry.notes || '');
  const [showDelete, setShowDelete] = useState(false);

  const updateChannel = useUpdateChannelEntry();
  const deleteChannel = useDeleteChannelEntry();

  const handleSave = async () => {
    await updateChannel.mutateAsync({ id: entry.id, channel_type: channelType, notes: notes || null });
    onClose();
  };

  const handleDelete = async () => {
    await deleteChannel.mutateAsync(entry.id);
    setShowDelete(false);
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Company Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {entry.crm_company && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">{entry.crm_company.name}</p>
                  {entry.crm_company.industry && <p className="text-xs text-muted-foreground">{entry.crm_company.industry}</p>}
                </div>
              </div>
            )}
            {entry.contact && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">{entry.contact.full_name}</p>
                  {entry.contact.job_title && <p className="text-xs text-muted-foreground">{entry.contact.job_title}</p>}
                </div>
              </div>
            )}
            {(entry.contact?.email || entry.crm_company?.main_contact_email) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> {entry.contact?.email || entry.crm_company?.main_contact_email}
              </p>
            )}
            {(entry.contact?.phone_work || entry.crm_company?.phone) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> {entry.contact?.phone_work || entry.crm_company?.phone}
              </p>
            )}

            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channelType} onValueChange={(v) => setChannelType(v as ChannelType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={updateChannel.isPending}>
                {updateChannel.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Company?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the company from this channel. The original contact or company record will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
