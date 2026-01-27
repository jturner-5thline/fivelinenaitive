import { useState, useEffect } from 'react';
import { Check, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useLenderStages, StageOption } from '@/contexts/LenderStagesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { toast } from '@/hooks/use-toast';
import { DealSuggestion } from '@/hooks/useAllDealsSuggestions';
import { supabase } from '@/integrations/supabase/client';

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
  const [note, setNote] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [completeMilestone, setCompleteMilestone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    }
  }, [open, suggestion, lender?.stage]);

  const handleSubmit = async () => {
    if (!suggestion) return;

    setIsSubmitting(true);
    try {
      // Update lender if we have a lender context
      if (suggestion.lenderId && lender) {
        const lenderUpdates: Record<string, unknown> = {};
        
        // Add note to existing notes
        if (note.trim()) {
          const timestamp = new Date().toLocaleString();
          const newNote = `[${timestamp}] ${note.trim()}`;
          lenderUpdates.notes = lender.notes 
            ? `${lender.notes}\n\n${newNote}`
            : newNote;
        }

        // Update stage if changed
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
  const hasChanges = note.trim() || (selectedStage && selectedStage !== lender?.stage) || completeMilestone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {suggestion?.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {suggestion?.description}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Note input */}
          <div className="space-y-2">
            <Label htmlFor="note">Add an update note</Label>
            <Textarea
              id="note"
              placeholder="Enter your update or notes here..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Lender stage selector */}
          {hasLenderContext && lender && (
            <div className="space-y-2">
              <Label>Update lender stage</Label>
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

          {/* Milestone completion */}
          {hasMilestoneContext && milestone && !milestone.completed && (
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
                Mark "{milestone.title}" as complete
              </Label>
            </div>
          )}
        </div>

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
