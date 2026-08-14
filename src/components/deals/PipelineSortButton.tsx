import { ArrowUpDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PIPELINE_SORT_LABELS,
  PipelineSortMode,
  usePipelineSortMode,
} from '@/hooks/usePipelineSortMode';

/** Icon-only control for sorting deals inside each pipeline stage column. */
export function PipelineSortButton() {
  const { sortMode, setSortMode } = usePipelineSortMode();

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Sort deals within each stage"
                className="h-9 w-9 p-0 shrink-0 rounded-md backdrop-blur-md border border-border/40 bg-background/30 text-muted-foreground transition-all duration-200 hover:text-foreground hover:border-border/70"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sort deals in each stage</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end">
        {(Object.keys(PIPELINE_SORT_LABELS) as PipelineSortMode[]).map((mode) => (
          <DropdownMenuItem key={mode} onSelect={() => setSortMode(mode)} className="text-xs gap-2">
            <Check className={`h-3.5 w-3.5 ${sortMode === mode ? 'opacity-100' : 'opacity-0'}`} />
            {PIPELINE_SORT_LABELS[mode]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
