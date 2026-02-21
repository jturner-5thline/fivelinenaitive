import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Copy, Trash2, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetTabsProps {
  sheets: { name: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number, name: string) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
}

export function SheetTabs({ sheets, activeIndex, onSelect, onAdd, onRename, onDelete, onDuplicate }: SheetTabsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIndex]);

  const startRename = (index: number) => {
    setEditingIndex(index);
    setEditName(sheets[index].name);
  };

  const commitRename = () => {
    if (editingIndex !== null && editName.trim()) {
      onRename(editingIndex, editName.trim());
    }
    setEditingIndex(null);
  };

  return (
    <div className="flex items-center border-t bg-muted/50 overflow-x-auto">
      {/* Add sheet button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0 rounded-none border-r"
        onClick={onAdd}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      {/* Sheet tabs */}
      {sheets.map((sheet, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-xs font-medium border-r cursor-pointer transition-colors whitespace-nowrap group",
            activeIndex === index
              ? "bg-background text-foreground border-t-2 border-t-primary -mt-px"
              : "text-muted-foreground hover:bg-muted/80"
          )}
          onClick={() => onSelect(index)}
          onDoubleClick={() => startRename(index)}
        >
          {editingIndex === index ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingIndex(null);
              }}
              className="h-5 w-24 text-xs px-1 py-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span>{sheet.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => startRename(index)}>
                    <Edit3 className="h-3.5 w-3.5 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(index)}>
                    <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  {sheets.length > 1 && (
                    <DropdownMenuItem onClick={() => onDelete(index)} className="text-destructive">
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
