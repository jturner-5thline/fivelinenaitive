import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Columns2, PanelLeftClose, Rows2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmailLayout = 'split-even' | 'split-wide' | 'slide-over';

interface EmailLayoutSelectorProps {
  layout: EmailLayout;
  onLayoutChange: (layout: EmailLayout) => void;
}

const layouts: { value: EmailLayout; icon: typeof Columns2; label: string }[] = [
  { value: 'split-even', icon: Columns2, label: 'Split 50/50' },
  { value: 'split-wide', icon: Rows2, label: 'Wide reading pane' },
  { value: 'slide-over', icon: PanelLeftClose, label: 'Slide-over detail' },
];

export function EmailLayoutSelector({ layout, onLayoutChange }: EmailLayoutSelectorProps) {
  return (
    <div className="flex items-center border rounded-md p-0.5 bg-muted/30">
      {layouts.map(({ value, icon: Icon, label }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              onClick={() => onLayoutChange(value)}
              className={cn(
                'p-1.5 rounded transition-colors',
                layout === value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
