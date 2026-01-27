import React from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PanelLeftClose, PanelTopClose, LayoutGrid, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DriverLayout = 'sidebar' | 'top' | 'hidden';

interface FinanceLayoutToggleProps {
  layout: DriverLayout;
  onLayoutChange: (layout: DriverLayout) => void;
  className?: string;
}

export function FinanceLayoutToggle({ layout, onLayoutChange, className }: FinanceLayoutToggleProps) {
  return (
    <TooltipProvider>
      <ToggleGroup 
        type="single" 
        value={layout} 
        onValueChange={(v) => v && onLayoutChange(v as DriverLayout)}
        className={cn("border rounded-lg p-0.5 bg-muted/30", className)}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem 
              value="sidebar" 
              aria-label="Sidebar layout"
              className="h-7 w-7 p-0"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Sidebar panel</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem 
              value="top" 
              aria-label="Top section layout"
              className="h-7 w-7 p-0"
            >
              <PanelTopClose className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Top section</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem 
              value="hidden" 
              aria-label="Hide drivers"
              className="h-7 w-7 p-0"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Hide drivers panel</p>
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
