import { useState } from 'react';
import { Plus, Trash2, GripVertical, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { UnifiedChecklistItem } from './types';

interface ChecklistEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  grouped: Record<string, UnifiedChecklistItem[]>;
  onAddItem: (item: { name: string; category?: string; description?: string; is_required?: boolean }) => Promise<any>;
  onUpdateItem: (id: string, updates: { name?: string; category?: string; is_required?: boolean }) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<boolean>;
  isDealSpecific?: boolean;
}

export function ChecklistEditor({
  open, onOpenChange, categories, grouped, onAddItem, onUpdateItem, onDeleteItem, isDealSpecific,
}: ChecklistEditorProps) {
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(categories[0] || '');
  const [newRequired, setNewRequired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const result = await onAddItem({
      name: newName.trim(),
      category: newCategory || undefined,
      is_required: newRequired,
    });
    if (result) {
      setNewName('');
      setNewRequired(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await onUpdateItem(id, { name: editName.trim() });
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isDealSpecific ? 'Edit Deal Checklist Items' : 'Edit Template Checklist'}</DialogTitle>
        </DialogHeader>

        {/* Add new item */}
        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/20">
          <Input
            placeholder="New item name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-xs flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Checkbox checked={newRequired} onCheckedChange={(v) => setNewRequired(!!v)} />
            <span className="text-[10px]">Req</span>
          </div>
          <Button size="sm" className="h-8 gap-1" onClick={handleAdd} disabled={!newName.trim()}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {/* Item list */}
        <ScrollArea className="flex-1 max-h-[400px]">
          <div className="space-y-1 pr-2">
            {categories.map(cat => (
              <div key={cat} className="mb-3">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</span>
                <div className="mt-1 space-y-0.5">
                  {(grouped[cat] || []).map(item => (
                    <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs group hover:bg-muted/30">
                      <GripVertical className="h-3 w-3 text-muted-foreground/50 cursor-grab shrink-0" />
                      {editingId === item.id ? (
                        <>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-6 text-xs flex-1"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditingId(null); }}
                          />
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleSaveEdit(item.id)}>
                            <Check className="h-3 w-3 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate">{item.name}</span>
                          {item.is_required && <Badge variant="secondary" className="text-[9px] h-4 px-1">REQ</Badge>}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingId(item.id); setEditName(item.name); }}>
                              <Edit2 className="h-2.5 w-2.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onUpdateItem(item.id, { is_required: !item.is_required })}>
                              <span className="text-[9px]">{item.is_required ? 'OPT' : 'REQ'}</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => onDeleteItem(item.id)}>
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
