import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useUpdateReferralSource, type ReferralSourceRecord } from '@/hooks/useReferralSourcesPipeline';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  source: ReferralSourceRecord;
  onClose: () => void;
}

export function PromoteToPipelineDialog({ source, onClose }: Props) {
  const { data: stages = [] } = usePipelineStages();
  const { company } = useCompany();
  const updateReferral = useUpdateReferralSource();
  const qc = useQueryClient();
  const [stageId, setStageId] = useState(stages[0]?.id || '');
  const [loading, setLoading] = useState(false);

  const handlePromote = async () => {
    if (!stageId || !company?.id) return;
    setLoading(true);
    try {
      // Create partner record
      const { data: partner, error } = await supabase
        .from('partners' as any)
        .insert({
          name: source.name,
          firm_type: source.type,
          stage_id: stageId,
          owner_id: source.relationship_owner_id,
          company_id: company.id,
          notes: source.notes || '',
          sort_order_in_stage: 999,
          metadata: {},
        })
        .select('id')
        .single();

      if (error) throw error;

      // Update referral source with promoted partner id
      updateReferral.mutate({ id: source.id, promoted_to_partner_id: (partner as any).id });

      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success(`"${source.name}" added to pipeline`);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Pipeline</DialogTitle>
          <DialogDescription>
            Promote "{source.name}" to the partners pipeline. Choose which stage to place them in.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <Label>Pipeline Stage</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePromote} disabled={!stageId || loading}>
            {loading ? 'Adding...' : 'Add to Pipeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
