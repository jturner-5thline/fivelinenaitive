import { Trash2, FolderInput, X, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEAL_ATTACHMENT_CATEGORIES, DealAttachmentCategory } from '@/hooks/useDealAttachments';

interface DataRoomBulkActionsProps {
  selectedCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  onMove: (category: DealAttachmentCategory) => void;
  totalCount: number;
}

export function DataRoomBulkActions({
  selectedCount,
  onClearSelection,
  onSelectAll,
  onDelete,
  onMove,
  totalCount,
}: DataRoomBulkActionsProps) {
  if (selectedCount === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 text-muted-foreground"
        onClick={onSelectAll}
      >
        <CheckSquare className="h-4 w-4" />
        Select files
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 animate-fade-in">
      <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-md">
        <span className="text-sm font-medium text-primary">
          {selectedCount} selected
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-primary hover:text-primary/80"
          onClick={onClearSelection}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      
      {selectedCount < totalCount && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onSelectAll}
        >
          Select all ({totalCount})
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <FolderInput className="h-4 w-4" />
            Move to
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {DEAL_ATTACHMENT_CATEGORIES.map((category) => (
            <DropdownMenuItem
              key={category.value}
              onClick={() => onMove(category.value as DealAttachmentCategory)}
            >
              {category.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
    </div>
  );
}
