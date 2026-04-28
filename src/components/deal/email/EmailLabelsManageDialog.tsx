import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag, Trash2, Pencil, Plus, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  useLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  LABEL_COLOR_TOKENS,
  type EmailLabel,
  type LabelColor,
} from '@/hooks/useEmailLabels';
import { cn } from '@/lib/utils';

const COLOR_HEX: Record<string, string> = {
  amber: '#f59e0b',
  emerald: '#10b981',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  slate: '#94a3b8',
  orange: '#fb923c',
  teal: '#14b8a6',
  fuchsia: '#d946ef',
};

export function labelSwatch(color: LabelColor): string {
  return COLOR_HEX[color as string] ?? COLOR_HEX.slate;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EmailLabelsManageDialog({ open, onOpenChange }: Props) {
  const { data: labels = [] } = useLabels();
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<LabelColor>('sky');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<LabelColor>('sky');

  const startEdit = (l: EmailLabel) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditColor(l.color);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createLabel.mutateAsync({ name, color: newColor });
      setNewName('');
      toast.success('Label created');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not create label');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    try {
      await updateLabel.mutateAsync({ id: editingId, patch: { name, color: editColor } });
      setEditingId(null);
      toast.success('Label updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not update label');
    }
  };

  const handleDelete = async (l: EmailLabel) => {
    if (!confirm(`Delete label "${l.name}"? Emails will keep their content but lose this tag.`)) return;
    try {
      await deleteLabel.mutateAsync(l.id);
      toast.success('Label deleted');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not delete label');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" /> Manage labels
          </DialogTitle>
        </DialogHeader>

        {/* Create new */}
        <div className="rounded-md border border-border/40 p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">New label</div>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Hot Lender"
              maxLength={32}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || createLabel.isPending}
              className="h-8 gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <ColorRow value={newColor} onChange={setNewColor} />
        </div>

        {/* List */}
        <ScrollArea className="max-h-[320px]">
          <div className="space-y-1 pr-2">
            {labels.length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No labels yet. Create one above.
              </div>
            )}
            {labels.map((l) =>
              editingId === l.id ? (
                <div key={l.id} className="rounded-md border border-border/40 p-2 space-y-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={32}
                      autoFocus
                      className="h-8 text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveEdit} disabled={updateLabel.isPending}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ColorRow value={editColor} onChange={setEditColor} />
                </div>
              ) : (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 group"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: labelSwatch(l.color) }}
                  />
                  <span className="flex-1 truncate text-sm">{l.name}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => startEdit(l)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDelete(l)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorRow({ value, onChange }: { value: LabelColor; onChange: (v: LabelColor) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LABEL_COLOR_TOKENS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className={cn(
            'h-5 w-5 rounded-full border transition-all',
            value === c ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/60 scale-110' : 'border-border/40'
          )}
          style={{ background: COLOR_HEX[c] }}
        />
      ))}
    </div>
  );
}