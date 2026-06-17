import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useStatusNotes } from '@/hooks/useStatusNotes';
import { useSwallowClickThrough } from '@/hooks/useSwallowClickThrough';
import { toast } from 'sonner';

interface MoveToPipelineDialogProps {
  dealId: string;
  dealName: string;
  currentPipelineId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MoveToPipelineDialog({ dealId, dealName, currentPipelineId, isOpen, onClose }: MoveToPipelineDialogProps) {
  const { pipelines } = usePipelineContext();
  const { updateDeal } = useDealsContext();
  const { addStatusNote } = useStatusNotes(dealId);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const swallowClicks = useSwallowClickThrough();

  // Close the modal while installing capture-phase swallowers so the
  // click that dismissed the dialog (X / Cancel / backdrop / Esc) cannot
  // fall through to the deal card underneath and open the deal pop-up.
  const safeClose = () => {
    swallowClicks(250, () => {
      onClose();
    });
  };

  const availablePipelines = pipelines;
  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);

  const handleMove = async () => {
    if (!selectedPipelineId || !selectedStageId) return;
    setIsMoving(true);
    try {
      await updateDeal(dealId, {
        pipelineId: selectedPipelineId,
        stage: selectedStageId,
      });
      if (statusNote.trim()) {
        await addStatusNote(statusNote.trim());
      }
      toast.success(`Moved "${dealName}" to ${selectedPipeline?.name}`);
      safeClose();
    } catch (error) {
      toast.error('Failed to move deal');
    } finally {
      setIsMoving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      safeClose();
      setSelectedPipelineId('');
      setSelectedStageId('');
      setStatusNote('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md border-purple-500/40 shadow-2xl shadow-purple-500/20"
        style={{ background: 'linear-gradient(135deg, hsl(240, 20%, 22%), hsl(260, 25%, 18%))' }}
        onPointerDownOutside={(e) => { e.preventDefault(); safeClose(); }}
        onInteractOutside={(e) => { e.preventDefault(); }}
        onEscapeKeyDown={(e) => { e.preventDefault(); safeClose(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Move to Pipeline
          </DialogTitle>
          <DialogDescription>
            Move <span className="font-medium text-foreground">{dealName}</span> to a different pipeline. You'll need to select a starting stage in the new pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Target Pipeline</Label>
            <Select value={selectedPipelineId} onValueChange={(val) => { setSelectedPipelineId(val); setSelectedStageId(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a pipeline..." />
              </SelectTrigger>
              <SelectContent>
                {availablePipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.isDefault ? ' (Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPipeline && (
            <div className="space-y-2">
              <Label>Starting Stage</Label>
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a stage..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedPipeline.stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${s.color}`} />
                        {s.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Status Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Add a note about this move..."
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={(e) => { e.stopPropagation(); e.preventDefault(); safeClose(); }}>Cancel</Button>
          <Button onClick={handleMove} disabled={!selectedPipelineId || !selectedStageId || isMoving}>
            {isMoving ? 'Moving...' : 'Move Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
