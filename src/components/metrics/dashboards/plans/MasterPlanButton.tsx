import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MasterPlanDialog } from './MasterPlanDialog';
import { useCanEditMasterPlan } from '@/hooks/useCanEditMasterPlan';

interface Props {
  className?: string;
}

/**
 * Header-level button that opens the Master Plan editor covering
 * every widget across every Insights dashboard.
 */
export function MasterPlanButton({ className }: Props) {
  const [open, setOpen] = useState(false);
  const { canEditMasterPlan } = useCanEditMasterPlan();
  if (!canEditMasterPlan) return null;
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              className={cn('h-8 gap-1.5', className)}
            >
              <Target className="h-3.5 w-3.5" />
              Master Plan
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit monthly plan/targets for every dashboard widget</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && <MasterPlanDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}