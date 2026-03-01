import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StickyNote, Plus, Pin, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Annotation {
  id: string;
  content: string;
  color: 'default' | 'warning' | 'success' | 'destructive';
  is_pinned: boolean;
  user_initials: string;
  created_at: string;
}

interface InlineAnnotationProps {
  targetKey: string;
  targetLabel: string;
  annotations: Annotation[];
  onAdd: (targetKey: string, content: string, color: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const colorStyles: Record<string, string> = {
  default: 'border-border/50 bg-muted/30',
  warning: 'border-warning/30 bg-warning/5',
  success: 'border-success/30 bg-success/5',
  destructive: 'border-destructive/30 bg-destructive/5',
};

export function InlineAnnotation({ targetKey, targetLabel, annotations, onAdd, onDelete, onTogglePin }: InlineAnnotationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteColor, setNoteColor] = useState('default');

  const pinnedCount = annotations.filter(a => a.is_pinned).length;

  const handleAdd = () => {
    if (!newNote.trim()) return;
    onAdd(targetKey, newNote.trim(), noteColor);
    setNewNote('');
    setNoteColor('default');
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-0.5 p-0.5 rounded hover:bg-muted/50 transition-colors",
            annotations.length > 0 && "text-warning"
          )}
          title={`${annotations.length} note(s) on ${targetLabel}`}
        >
          <StickyNote className="h-3 w-3" />
          {annotations.length > 0 && (
            <span className="text-[9px] font-bold">{annotations.length}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <StickyNote className="h-3 w-3 text-warning" />
              {targetLabel}
            </span>
            <Badge variant="outline" className="text-[9px]">{annotations.length} notes</Badge>
          </div>
        </div>

        <div className="max-h-48 overflow-y-auto p-2 space-y-1.5">
          {annotations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No annotations</p>
          )}
          {annotations.map(a => (
            <div key={a.id} className={cn("p-2 rounded border text-[10px]", colorStyles[a.color])}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground">{a.user_initials} · {a.created_at}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => onTogglePin(a.id)} className={cn("p-0.5 rounded hover:bg-muted/50", a.is_pinned && "text-primary")}>
                    <Pin className="h-2.5 w-2.5" />
                  </button>
                  <button onClick={() => onDelete(a.id)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              <p>{a.content}</p>
            </div>
          ))}
        </div>

        <div className="p-2 border-t border-border/50 space-y-2">
          <Textarea
            placeholder="Add a note…"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            className="min-h-[50px] text-xs resize-none"
          />
          <div className="flex items-center justify-between">
            <Select value={noteColor} onValueChange={setNoteColor}>
              <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="destructive">Alert</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={handleAdd} disabled={!newNote.trim()}>
              <Plus className="h-2.5 w-2.5" /> Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
