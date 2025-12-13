import { useState } from 'react';
import { Plus, X, Check, Pencil, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface OutstandingItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

interface OutstandingItemsProps {
  items: OutstandingItem[];
  onAdd: (text: string) => void;
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
  onDelete: (id: string) => void;
}

export function OutstandingItems({ items, onAdd, onUpdate, onDelete }: OutstandingItemsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleAdd = () => {
    if (newItemText.trim()) {
      onAdd(newItemText.trim());
      setNewItemText('');
      setIsAdding(false);
    }
  };

  const handleStartEdit = (item: OutstandingItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const handleSaveEdit = () => {
    if (editingId && editingText.trim()) {
      onUpdate(editingId, { text: editingText.trim() });
      setEditingId(null);
      setEditingText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const completedCount = items.filter(i => i.completed).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Check className="h-5 w-5" />
          Outstanding Items
          {items.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({completedCount}/{items.length})
            </span>
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAdding && (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter item..."
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') {
                  setIsAdding(false);
                  setNewItemText('');
                }
              }}
              autoFocus
              className="flex-1"
            />
            <Button size="sm" onClick={handleAdd}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewItemText('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {items.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No outstanding items
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border border-border bg-card",
              item.completed && "opacity-60"
            )}
          >
            <Checkbox
              checked={item.completed}
              onCheckedChange={(checked) =>
                onUpdate(item.id, { completed: checked === true })
              }
            />
            {editingId === item.id ? (
              <div className="flex-1 flex items-center gap-2">
                <Input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  autoFocus
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSaveEdit}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      "text-sm block",
                      item.completed && "line-through text-muted-foreground"
                    )}
                  >
                    {item.text}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    Requested {format(new Date(item.createdAt), 'MMM d, yyyy')}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleStartEdit(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(item.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
