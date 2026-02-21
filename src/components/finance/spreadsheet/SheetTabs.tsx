import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, MoreHorizontal, Copy, Trash2, Edit3, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

const TAB_COLORS = [
  null,
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface SheetTabsProps {
  sheets: { name: string; tabColor?: string | null }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number, name: string) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onSetTabColor?: (index: number, color: string | null) => void;
}

export function SheetTabs({ sheets, activeIndex, onSelect, onAdd, onRename, onDelete, onDuplicate, onReorder, onSetTabColor }: SheetTabsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
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
    if (editingIndex !== null && editName.trim()) onRename(editingIndex, editName.trim());
    setEditingIndex(null);
  };

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) onReorder?.(dragIndex, toIndex);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, onReorder]);

  return (
    <div className="flex items-center border-t bg-muted/50 overflow-x-auto">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 rounded-none border-r" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
      </Button>

      {sheets.map((sheet, index) => (
        <div
          key={index}
          draggable={editingIndex !== index}
          onDragStart={(e) => handleDragStart(index, e)}
          onDragOver={(e) => handleDragOver(index, e)}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          onDrop={() => handleDrop(index)}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-xs font-medium border-r cursor-pointer transition-colors whitespace-nowrap group relative",
            activeIndex === index
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-muted/80",
            dragOverIndex === index && dragIndex !== index && "border-l-2 border-l-primary",
          )}
          onClick={() => onSelect(index)}
          onDoubleClick={() => startRename(index)}
        >
          {/* Tab color indicator */}
          {(sheet as any).tabColor && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: (sheet as any).tabColor }} />
          )}
          {activeIndex === index && !(sheet as any).tabColor && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary" />
          )}

          {editingIndex === index ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingIndex(null); }}
              className="h-5 w-24 text-xs px-1 py-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span>{sheet.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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
                  <DropdownMenuSeparator />
                  {/* Tab color submenu inline */}
                  <div className="px-2 py-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5"><Palette className="h-3 w-3" /> Tab Color</span>
                    <div className="flex gap-1 flex-wrap">
                      {TAB_COLORS.map((color, ci) => (
                        <button
                          key={ci}
                          className={cn(
                            "w-4 h-4 rounded-sm border transition-transform hover:scale-125",
                            !color && "bg-muted border-dashed",
                            (sheet as any).tabColor === color && "ring-1 ring-primary ring-offset-1",
                          )}
                          style={color ? { backgroundColor: color } : undefined}
                          onClick={(e) => { e.stopPropagation(); onSetTabColor?.(index, color); }}
                        />
                      ))}
                    </div>
                  </div>
                  {sheets.length > 1 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(index)} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </>
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
