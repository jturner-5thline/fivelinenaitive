import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Check, Pencil, X } from 'lucide-react';
import { useIndustryOptions, useManageIndustryOptions } from '@/hooks/useIndustryOptions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageIndustryOptionsDialog({ open, onOpenChange }: Props) {
  const { rows, options, isCustomised, isLoading } = useIndustryOptions();
  const { ensureSeeded, add, rename, remove } = useManageIndustryOptions();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (open && !isLoading && !isCustomised) {
      void ensureSeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, isCustomised]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (options.some(o => o.toLowerCase() === name.toLowerCase())) return;
    add.mutate(name, { onSuccess: () => setNewName('') });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage industries</DialogTitle>
          <DialogDescription>
            These options appear in the Industry dropdown across your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={newName}
            placeholder="Add an industry…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          />
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || add.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-72 pr-3">
          <div className="space-y-1">
            {rows.map(row => (
              <div key={row.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                {editingId === row.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      className="h-8"
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (editingName.trim()) rename.mutate({ id: row.id, name: editingName });
                          setEditingId(null);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        if (editingName.trim()) rename.mutate({ id: row.id, name: editingName });
                        setEditingId(null);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm">{row.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => { setEditingId(row.id); setEditingName(row.name); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => remove.mutate(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-4">Loading industries…</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
