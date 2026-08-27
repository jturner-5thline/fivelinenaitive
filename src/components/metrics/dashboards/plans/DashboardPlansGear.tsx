import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MasterPlanDialog } from './MasterPlanDialog';
import type { PlannableDashboardKey } from './plannableWidgetsRegistry';
import { useCanEditMasterPlan } from '@/hooks/useCanEditMasterPlan';

interface Props {
  dashboardKey: PlannableDashboardKey;
  className?: string;
}

/**
 * Gear button that opens the unified Master Plan editor pre-filtered to
 * this dashboard's tab. Consolidated (2026-07) to eliminate a second write
 * path that shared the same `plan:{dashboard}:{widget}` rows and could race
 * with the Master Plan dialog's autosave.
 */
export function DashboardPlansGear({ dashboardKey, className }: Props) {
  const [open, setOpen] = useState(false);
  const { canEditMasterPlan } = useCanEditMasterPlan();
  // Gear retired (2026-08): the Insights header "Master Plan" button is the
  // single entry point to the plan editor. Kept as a no-op so dashboards that
  // still mount it don't need touching.
  return null;
  // eslint-disable-next-line no-unreachable
  return (

    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label="Edit plans / targets in Master Plan"
              className={cn('h-8 w-8 text-muted-foreground hover:text-foreground', className)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit plans / targets (Master Plan)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <MasterPlanDialog
          open={open}
          onOpenChange={setOpen}
          initialTab={dashboardKey}
        />
      )}
    </>
  );
}