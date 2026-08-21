import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { DealCorrectionsLog } from '@/components/deal/DealCorrectionsLog';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';

interface Props {
  dealId: string;
}

/**
 * Compact launcher for the Approval Queue corrections log.
 * Shows a notification badge when corrections (edits, rejections,
 * clarification requests) exist on this deal.
 */
export function DealCorrectionsButton({ dealId }: Props) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: queueRows } = await supabase
          .from('ai_action_queue')
          .select('id')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(500);
        const ids = (queueRows || []).map((r: any) => r.id);
        if (ids.length === 0) {
          if (!cancelled) setCount(0);
          return;
        }
        const { data: audit } = await supabase
          .from('approval_queue_audit')
          .select('decision, was_edited')
          .in('action_queue_id', ids);
        const n = (audit || []).filter(
          (r: any) =>
            r.was_edited ||
            r.decision === 'rejected' ||
            r.decision === 'edited_approved' ||
            r.decision === 'more_context',
        ).length;
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, open]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative h-8 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        <span className="text-xs">Approval Queue corrections</span>
        {count > 0 && (
          <Badge
            variant="destructive"
            className="h-4 min-w-4 px-1 text-[10px] absolute -top-1.5 -right-1.5"
          >
            {count}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approval Queue corrections</DialogTitle>
          </DialogHeader>
          <DealCorrectionsLog dealId={dealId} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DealCorrectionsButton;
