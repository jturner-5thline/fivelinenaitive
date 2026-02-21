import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Copy, Scissors, ClipboardPaste, Trash2, Plus, Rows3, Columns3,
  SortAsc, SortDesc, Merge, SplitSquareHorizontal, MessageSquare,
} from 'lucide-react';

interface CellContextMenuProps {
  children: React.ReactNode;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onInsertRow: () => void;
  onInsertColumn: () => void;
  onDeleteRow: () => void;
  onDeleteColumn: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onAddComment: () => void;
  hasRangeSelection?: boolean;
}

export function CellContextMenu({
  children,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onInsertRow,
  onInsertColumn,
  onDeleteRow,
  onDeleteColumn,
  onSortAsc,
  onSortDesc,
  onMerge,
  onUnmerge,
  onAddComment,
  hasRangeSelection,
}: CellContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onCut}>
          <Scissors className="h-3.5 w-3.5 mr-2" /> Cut
          <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+X</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={onCopy}>
          <Copy className="h-3.5 w-3.5 mr-2" /> Copy
          <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+C</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={onPaste}>
          <ClipboardPaste className="h-3.5 w-3.5 mr-2" /> Paste
          <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+V</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear Contents
          <span className="ml-auto text-[10px] text-muted-foreground">Del</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="h-3.5 w-3.5 mr-2" /> Insert
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={onInsertRow}>
              <Rows3 className="h-3.5 w-3.5 mr-2" /> Row Below
            </ContextMenuItem>
            <ContextMenuItem onClick={onInsertColumn}>
              <Columns3 className="h-3.5 w-3.5 mr-2" /> Column Right
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={onDeleteRow}>
              <Rows3 className="h-3.5 w-3.5 mr-2" /> Row
            </ContextMenuItem>
            <ContextMenuItem onClick={onDeleteColumn}>
              <Columns3 className="h-3.5 w-3.5 mr-2" /> Column
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onSortAsc}>
          <SortAsc className="h-3.5 w-3.5 mr-2" /> Sort A → Z
        </ContextMenuItem>
        <ContextMenuItem onClick={onSortDesc}>
          <SortDesc className="h-3.5 w-3.5 mr-2" /> Sort Z → A
        </ContextMenuItem>
        <ContextMenuSeparator />
        {hasRangeSelection && (
          <ContextMenuItem onClick={onMerge}>
            <Merge className="h-3.5 w-3.5 mr-2" /> Merge Cells
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onUnmerge}>
          <SplitSquareHorizontal className="h-3.5 w-3.5 mr-2" /> Unmerge Cells
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onAddComment}>
          <MessageSquare className="h-3.5 w-3.5 mr-2" /> Add Comment
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
