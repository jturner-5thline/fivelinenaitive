import { useState, useEffect } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { usePipelineStages, useUpdatePartner, useDeletePartner, type Partner } from '@/hooks/usePartnersPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { format } from 'date-fns';

const PARTNER_TYPES = ['Channel Partner', 'Bank'];

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
  const ownerMember = teamMembers.find((m: any) => m.id === (editing ? ownerId : partner?.owner_id));

  return (
    <Dialog open={!!partner} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[90vw] w-[90vw] max-h-[88vh] h-[88vh] p-0 bg-slate-800 border-slate-700 text-white overflow-hidden">
        {partner && (
          <div className="flex h-full">
            {/* Left Column - Partner Info (~40%) */}
            <div className="w-[38%] border-r border-slate-700 p-6 flex flex-col">
              {/* Header */}
              <div className="mb-6">
                {editing ? (
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="text-xl font-semibold bg-slate-900 border-slate-600 text-white"
                  />
                ) : (
                  <h2 className="text-xl font-semibold text-white">{partner.name}</h2>
                )}
                <p className="text-xs text-slate-500 mt-1">Added {format(new Date(partner.created_at), 'MMM d, yyyy')}</p>
              </div>

              {/* Fields */}
              <div className="space-y-5 flex-1">
                {/* Type */}
                <div>
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">Type</Label>
                  {editing ? (
                    <Select value={firmType} onValueChange={setFirmType}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PARTNER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-white mt-1">{partner.firm_type || '—'}</p>
                  )}
                </div>

                {/* Relationship Owner */}
                <div>
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">Relationship Owner</Label>
                  {editing ? (
                    <Select value={ownerId} onValueChange={setOwnerId}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="Select owner" /></SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-white mt-1">{(ownerMember as any)?.display_name || 'Unassigned'}</p>
                  )}
                </div>

                {/* Stage */}
                <div>
                  <Label className="text-xs text-slate-400 uppercase tracking-wider">Stage</Label>
                  {editing ? (
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      {currentStage && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: currentStage.color }} />}
                      <p className="text-sm text-white">{currentStage?.name || 'Unassigned'}</p>
                    </div>
                  )}
                </div>

                {/* Move to Stage (non-edit mode quick action) */}
                {!editing && (
                  <div>
                    <Label className="text-xs text-slate-400 uppercase tracking-wider">Move to Stage</Label>
                    <Select value={partner.stage_id || ''} onValueChange={(v) => update.mutate({ id: partner.id, stage_id: v || null })}>
                      <SelectTrigger className="mt-1.5 h-9 text-sm bg-slate-900 border-slate-600 text-white">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-slate-700 mt-4">
                {editing ? (
                  <>
                    <Button size="sm" onClick={handleSave} disabled={update.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                <div className="ml-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="gap-1.5">
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
            </div>

            {/* Right Column - Content (~60%) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-0">
              {/* Referred Deals */}
              <div className="pb-5">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Referred Deals</h3>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
                  <p className="text-sm text-slate-400">No referred deals found.</p>
                  <p className="text-xs text-slate-500 mt-1">Deals where this partner is the referral source will appear here.</p>
                </div>
              </div>

              <div className="border-t border-slate-700" />

              {/* Activity History */}
              <div className="py-5">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Activity History</h3>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
                  <p className="text-sm text-slate-400">No activity history yet.</p>
                  <p className="text-xs text-slate-500 mt-1">Meetings, emails, and interactions will appear here.</p>
                </div>
              </div>

              <div className="border-t border-slate-700" />

              {/* Notes */}
              <div className="pt-5">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Notes</h3>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Write notes about this partner..."
                  className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                />
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (!partner) return;
                    update.mutate({ id: partner.id, notes });
                  }}
                  disabled={update.isPending || notes === partner.notes}
                >
                  Save Notes
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
