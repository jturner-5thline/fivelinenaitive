import { useState, useEffect } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-white">{partner?.name || 'Partner Details'}</DialogTitle>
        </DialogHeader>

        {partner && (
          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="bg-slate-900 border border-slate-700">
              <TabsTrigger value="details" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">Details</TabsTrigger>
              <TabsTrigger value="deals" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">Referred Deals</TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">Activity</TabsTrigger>
              <TabsTrigger value="notes" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">Notes</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="mt-4 space-y-4">
              {editing ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} className="bg-slate-900 border-slate-600 text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Type</Label>
                    <Select value={firmType} onValueChange={setFirmType}>
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PARTNER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Stage</Label>
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Relationship Owner</Label>
                    <Select value={ownerId} onValueChange={setOwnerId}>
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="Select owner" /></SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSave} disabled={update.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Type</p>
                    <p className="text-sm text-white">{partner.firm_type || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Stage</p>
                    <div className="flex items-center gap-1.5">
                      {currentStage && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentStage.color }} />}
                      <p className="text-sm text-white">{currentStage?.name || 'Unassigned'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Relationship Owner</p>
                    <p className="text-sm text-white">{(ownerMember as any)?.display_name || 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Created</p>
                    <p className="text-sm text-white">{format(new Date(partner.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 mb-1">Move to Stage</p>
                    <Select value={partner.stage_id || ''} onValueChange={(v) => update.mutate({ id: partner.id, stage_id: v || null })}>
                      <SelectTrigger className="h-8 text-xs bg-slate-900 border-slate-600 text-white w-48">
                        <SelectValue placeholder="Move to Stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Referred Deals Tab */}
            <TabsContent value="deals" className="mt-4">
              <div className="rounded-lg border border-slate-700 p-6 text-center">
                <p className="text-sm text-slate-400">No referred deals found for this partner.</p>
                <p className="text-xs text-slate-500 mt-1">Deals where this partner is set as the referral source will appear here.</p>
              </div>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <div className="rounded-lg border border-slate-700 p-6 text-center">
                <p className="text-sm text-slate-400">No activity history yet.</p>
                <p className="text-xs text-slate-500 mt-1">Meetings, emails, and logged interactions with this partner will appear here.</p>
              </div>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="mt-4 space-y-3">
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={6}
                placeholder="Write notes about this partner..."
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!partner) return;
                  update.mutate({ id: partner.id, notes });
                }}
                disabled={update.isPending || notes === partner.notes}
              >
                Save Notes
              </Button>
            </TabsContent>

            {/* Footer actions */}
            <div className="flex items-center gap-2 pt-4 mt-4 border-t border-slate-700">
              {!editing && (
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
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
