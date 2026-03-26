import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { usePipelineStages, useUpdatePartner, useDeletePartner, type Partner } from '@/hooks/usePartnersPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { format } from 'date-fns';

const FIRM_TYPES = ['Investment Bank', 'Broker', 'Advisor', 'Lender', 'Strategic', 'Other'];

export function PartnerDetailPanel({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const { data: stages = [] } = usePipelineStages();
  const teamMembers = useTeamMembers();
  const update = useUpdatePartner();
  const del = useDeletePartner();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [firmType, setFirmType] = useState('');
  const [stageId, setStageId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (partner) {
      setName(partner.name);
      setFirmType(partner.firm_type);
      setStageId(partner.stage_id || '');
      setOwnerId(partner.owner_id || '');
      setNotes(partner.notes);
      setEditing(false);
    }
  }, [partner]);

  const handleSave = () => {
    if (!partner) return;
    update.mutate({
      id: partner.id,
      name: name.trim(),
      firm_type: firmType,
      stage_id: stageId || null,
      owner_id: ownerId || null,
      notes,
    }, { onSuccess: () => setEditing(false) });
  };

  const handleDelete = () => {
    if (!partner) return;
    del.mutate(partner.id, { onSuccess: onClose });
  };

  const currentStage = stages.find(s => s.id === (editing ? stageId : partner?.stage_id));
  const ownerMember = teamMembers.find((m: any) => m.user_id === (editing ? ownerId : partner?.owner_id));

  return (
    <Sheet open={!!partner} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{partner?.name || 'Partner Details'}</SheetTitle>
        </SheetHeader>

        {partner && (
          <div className="mt-4 space-y-4">
            {editing ? (
              <>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
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
                  <Label>Stage</Label>
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
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={update.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-400">Firm Type</p>
                    <p className="text-sm text-white">{partner.firm_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Stage</p>
                    <div className="flex items-center gap-1.5">
                      {currentStage && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentStage.color }} />}
                      <p className="text-sm text-white">{currentStage?.name || 'Unassigned'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Relationship Owner</p>
                    <p className="text-sm text-white">{(ownerMember as any)?.display_name || 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Created</p>
                    <p className="text-sm text-white">{format(new Date(partner.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  {partner.notes && (
                    <div>
                      <p className="text-xs text-slate-400">Notes</p>
                      <p className="text-sm text-white whitespace-pre-wrap">{partner.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-700">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                  <Select value={partner.stage_id || ''} onValueChange={(v) => update.mutate({ id: partner.id, stage_id: v || null })}>
                    <SelectTrigger className="h-8 text-xs w-auto">
                      <SelectValue placeholder="Move to Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" className="gap-1">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete partner?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove {partner.name} from the pipeline.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
