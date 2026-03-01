import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, Flag, TrendingUp, MoreHorizontal, Bookmark, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PLRowQuickActionsProps {
  rowAccount: string;
  visible: boolean;
  onComment?: () => void;
  onFlag?: () => void;
  onDrillDown?: () => void;
  onBookmark?: () => void;
}

export function PLRowQuickActions({
  rowAccount,
  visible,
  onComment,
  onFlag,
  onDrillDown,
  onBookmark,
}: PLRowQuickActionsProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-0.5 animate-in fade-in-0 slide-in-from-right-2 duration-150">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onComment?.(); }}
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">Add comment</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-amber-500"
            onClick={(e) => { e.stopPropagation(); onFlag?.(); }}
          >
            <Flag className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">Flag for review</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onDrillDown?.(); }}
          >
            <TrendingUp className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">Drill down</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem className="text-xs gap-2" onClick={onBookmark}>
            <Bookmark className="h-3 w-3" /> Bookmark row
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" onClick={onDrillDown}>
            <Eye className="h-3 w-3" /> View transactions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
