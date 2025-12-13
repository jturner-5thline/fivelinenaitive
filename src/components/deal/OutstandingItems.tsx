import { useState } from 'react';
import { Plus, X, Check, Pencil, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface OutstandingItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  requestedBy: string;
}

interface OutstandingItemsProps {
  items: OutstandingItem[];
  lenderNames: string[];
  onAdd: (text: string, requestedBy: string) => void;
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
  onDelete: (id: string) => void;
}

export function OutstandingItems({ items, lenderNames, onAdd, onUpdate, onDelete }: OutstandingItemsProps) {
  const [newItemText, setNewItemText] = useState('');
  const [newRequestedBy, setNewRequestedBy] = useState('5th Line');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const requestedByOptions = ['5th Line', ...lenderNames];

  const handleAdd = () => {
    if (newItemText.trim()) {
      onAdd(newItemText.trim(), newRequestedBy);
      setNewItemText('');
      setNewRequestedBy('5th Line');
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
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
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
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Requested {format(new Date(item.createdAt), 'MMM d, yyyy')}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      by {item.requestedBy}
                    </span>
                  </div>
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

        {/* Always-visible input for adding new items */}
        <div className={`${items.length > 0 ? 'pt-3 border-t border-border' : ''}`}>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Type to add an item..."
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItemText.trim()) {
                  handleAdd();
                }
                if (e.key === 'Escape') {
                  setNewItemText('');
                }
              }}
              className="flex-1"
            />
            <Select value={newRequestedBy} onValueChange={setNewRequestedBy}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Requested by..." />
              </SelectTrigger>
              <SelectContent>
                {requestedByOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
