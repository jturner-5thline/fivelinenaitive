import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, RotateCcw } from "lucide-react";

interface ManagerDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecisionMade?: () => void;
  task: {
    id: string;
    title: string;
    description?: string | null;
    workflow_key?: string;
    deal_id: string;
    deal?: { id: string; name?: string; company_name?: string; stage?: string } | null;
    recurrence_stop_conditions?: Array<{ field: string; operator: string; value?: unknown }> | null;
  };
}

export function ManagerDecisionDialog({ open, onOpenChange, onDecisionMade, task }: ManagerDecisionDialogProps) {
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const dealName = task.deal?.name || task.deal?.company_name || "Unknown Deal";
  const dealStage = task.deal?.stage || "Unknown Stage";

  const handleMoveForward = async () => {
    setLoading(true);
    try {
      const { error: dealError } = await supabase
        .from("deals")
        .update({ manager_move_forward_decision: true })
        .eq("id", task.deal_id);

      if (dealError) {
        await supabase
          .from("wf_deals")
          .update({ manager_move_forward_decision: true } as any)
          .eq("id", task.deal_id);
      }

      await supabase
        .from("wf_deals")
        .update({ manager_move_forward_decision: true } as any)
        .eq("id", task.deal_id);

      qc.invalidateQueries({ queryKey: ["wf_tasks"] });
      qc.invalidateQueries({ queryKey: ["wf_deals"] });
      toast.success("Deal will move forward. Recurring follow-ups will stop.");
      onDecisionMade?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to update decision:", err);
      toast.error("Failed to record decision");
    } finally {
      setLoading(false);
    }
  };

  const handleKeepFollowing = () => {
    toast.info("Continuing follow-ups.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manager Decision Required</DialogTitle>
          <DialogDescription>
            This is a recurring follow-up task for <strong>{dealName}</strong>. Choose how to proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">{task.title}</p>
            {task.description && (
              <p className="text-xs text-muted-foreground whitespace-pre-line">{task.description}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {task.workflow_key && (
                <Badge variant="outline" className="text-xs">{task.workflow_key}</Badge>
              )}
              <Badge variant="secondary" className="text-xs">Stage: {dealStage}</Badge>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleKeepFollowing}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Keep Following Up
          </Button>
          <Button
            onClick={handleMoveForward}
            disabled={loading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
          >
            <ArrowRight className="h-4 w-4" />
            {loading ? "Saving..." : "Move Deal Forward"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}