import { useState, useEffect } from 'react';
import { Check, Loader2, ArrowRight, Plus, Trash2, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { useStatusNotes } from '@/hooks/useStatusNotes';
import { toast } from '@/hooks/use-toast';
import { DealSuggestion } from '@/hooks/useAllDealsSuggestions';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface SuggestionActionDialogProps {
  suggestion: DealSuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function SuggestionActionDialog({
  suggestion,
  open,
  onOpenChange,
  onComplete,
}: SuggestionActionDialogProps) {
  const { stages } = useLenderStages();
  const { getDealById, updateLender, refreshDeals } = useDealsContext();
  const { milestonesMap, refetch: refetchMilestones } = useAllMilestones();
  const { statusNotes, addStatusNote, deleteStatusNote } = useStatusNotes(suggestion?.dealId);

  const [note, setNote] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [completeMilestone, setCompleteMilestone] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [newStatusNote, setNewStatusNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingStatusNote, setIsAddingStatusNote] = useState(false);

  // Get deal and lender info
  const deal = suggestion ? getDealById(suggestion.dealId) : null;
  const lender = deal?.lenders?.find(l => l.id === suggestion?.lenderId);
  const milestones = suggestion?.dealId ? milestonesMap[suggestion.dealId] || [] : [];
  const milestone = milestones.find(m => m.id === suggestion?.milestoneId);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && suggestion) {
      setNote('');
      setSelectedStage(lender?.stage || '');
      setCompleteMilestone(false);
      setMilestoneTitle(milestone?.title || '');
      setNewStatusNote('');
    }
  }, [open, suggestion, lender?.stage, milestone?.title]);

  const handleAddStatusNote = async () => {
    if (!newStatusNote.trim()) return;
    setIsAddingStatusNote(true);
    try {
      await addStatusNote(newStatusNote.trim());
      setNewStatusNote('');
      toast({ title: 'Status note added' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to add status note' });
    } finally {
      setIsAddingStatusNote(false);
    }
  };

  const handleDeleteStatusNote = async (noteId: string) => {
    await deleteStatusNote(noteId);
  };

  const handleSubmit = async () => {
    if (!suggestion) return;

    setIsSubmitting(true);
    try {
      // Update lender if we have a lender context
      if (suggestion.lenderId && lender) {
        const lenderUpdates: Record<string, unknown> = {};
        
        if (note.trim()) {
          lenderUpdates.notes = note.trim();
        }

        if (selectedStage && selectedStage !== lender.stage) {
          lenderUpdates.stage = selectedStage;
          const targetStage = stages.find(s => s.id === selectedStage);
          if (targetStage) {
            lenderUpdates.trackingStatus = targetStage.group;
          }
        }

        if (Object.keys(lenderUpdates).length > 0) {
          await updateLender(suggestion.lenderId, lenderUpdates);
        }
      }

      // Update milestone title if changed
      if (suggestion.milestoneId && milestone && milestoneTitle.trim() && milestoneTitle !== milestone.title) {
        const { error } = await supabase
          .from('deal_milestones')
          .update({ title: milestoneTitle.trim() })
          .eq('id', suggestion.milestoneId);
        if (error) throw error;
      }

      // Complete milestone if requested
      if (suggestion.milestoneId && completeMilestone) {
        const { error } = await supabase
          .from('deal_milestones')
          .update({ 
            completed: true, 
            completed_at: new Date().toISOString() 
          })
          .eq('id', suggestion.milestoneId);
        if (error) throw error;
      }

      // Refresh data
      await Promise.all([
        refreshDeals(),
        refetchMilestones(),
      ]);

      toast({
        title: 'Update saved',
        description: 'Your changes have been applied successfully.',
      });

      onOpenChange(false);
      onComplete?.();
    } catch (error) {
      console.error('Failed to save update:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to save',
        description: 'There was an error saving your update. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasLenderContext = !!suggestion?.lenderId;
  const hasMilestoneContext = !!suggestion?.milestoneId;
  const milestoneTitleChanged = milestone && milestoneTitle.trim() && milestoneTitle !== milestone.title;
  const hasChanges = note.trim() || (selectedStage && selectedStage !== lender?.stage) || completeMilestone || milestoneTitleChanged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {suggestion?.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {suggestion?.description}
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
            {/* Lender note input */}
            {hasLenderContext && (
              <div className="space-y-2">
                <Label htmlFor="note">Lender note</Label>
                {lender?.notes && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 break-words">
                    Current: {lender.notes}
                  </p>
                )}
                <Textarea
                  id="note"
                  placeholder="Add or replace lender note..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
            )}

            {/* Lender stage selector */}
            {hasLenderContext && lender && (
              <div className="space-y-2">
                <Label>Lender stage</Label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStage && selectedStage !== lender.stage && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{stages.find(s => s.id === lender.stage)?.label || lender.stage}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium text-primary">
                      {stages.find(s => s.id === selectedStage)?.label || selectedStage}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Milestone editing */}
            {hasMilestoneContext && milestone && (
              <div className="space-y-2">
                <Label>Milestone</Label>
                <Input
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  placeholder="Milestone title"
                  className="h-9"
                />
                {!milestone.completed && (
                  <div className="flex items-center space-x-2 p-3 rounded-lg border bg-muted/30">
                    <Checkbox
                      id="complete-milestone"
                      checked={completeMilestone}
                      onCheckedChange={(checked) => setCompleteMilestone(checked === true)}
                    />
                    <Label 
                      htmlFor="complete-milestone" 
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      Mark as complete
                    </Label>
                  </div>
                )}
                {milestone.completed && (
                  <p className="text-xs text-muted-foreground">
                    ✓ Completed {milestone.completedAt ? format(new Date(milestone.completedAt), 'MMM d, yyyy') : ''}
                  </p>
                )}
              </div>
            )}

            {/* Status Notes Section */}
            {suggestion?.dealId && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <StickyNote className="h-3.5 w-3.5" />
                    Status Notes
                  </Label>
                  
                  {/* Add new status note */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a status note..."
                      value={newStatusNote}
                      onChange={(e) => setNewStatusNote(e.target.value)}
                      rows={2}
                      className="resize-none flex-1"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0 self-end h-9 w-9"
                      onClick={handleAddStatusNote}
                      disabled={!newStatusNote.trim() || isAddingStatusNote}
                    >
                      {isAddingStatusNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Existing status notes */}
                  {statusNotes.length > 0 && (
                    <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                      {statusNotes.map((sn) => (
                        <div key={sn.id} className="group flex items-start gap-2 text-xs p-2 rounded bg-muted/40 border border-border/50">
                          <span className="flex-1 text-muted-foreground break-words">
                            <span className="text-foreground">{sn.note}</span>
                            <span className="block text-[10px] mt-0.5 opacity-60">
                              {format(new Date(sn.created_at), 'MMM d, h:mm a')}
                            </span>
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteStatusNote(sn.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting || !hasChanges}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Update
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
