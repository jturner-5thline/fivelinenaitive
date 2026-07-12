import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardPlansDialog } from './DashboardPlansDialog';
import type { PlannableDashboardKey } from './plannableWidgetsRegistry';

interface Props {
  dashboardKey: PlannableDashboardKey;
  className?: string;
}

/**
 * Gear button that opens the Excel-style Plans/Targets editor for the
 * given dashboard. Renders inline; caller controls positioning via
 * `className` (e.g. absolute top-2 right-2, or inline).
 */
export function DashboardPlansGear({ dashboardKey, className }: Props) {
  const [open, setOpen] = useState(false);
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
              aria-label="Edit plans / targets"
              className={cn('h-8 w-8 text-muted-foreground hover:text-foreground', className)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit plans / targets</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <DashboardPlansDialog
          open={open}
          onOpenChange={setOpen}
          dashboardKey={dashboardKey}
        />
      )}
    </>
  );
}