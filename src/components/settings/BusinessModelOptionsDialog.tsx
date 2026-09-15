import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useBusinessModelOptions, getDefaultBusinessModelOptions, countDealsUsingBusinessModels } from '@/hooks/useBusinessModelOptions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BusinessModelOptionsDialog({ open, onOpenChange }: Props) {
  const { options, saveOptions, isSaving } = useBusinessModelOptions();
  const [draft, setDraft] = useState<string[]>([]);
  const [newValue, setNewValue] = useState('');
  const [inUse, setInUse] = useState<Record<string, number> | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft([...options]);
      setNewValue('');
      setInUse(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const removed = useMemo(() => {
    const draftSet = new Set(draft.map(v => v.trim().toLowerCase()));
    return options.filter(v => !draftSet.has(v.trim().toLowerCase()));
  }, [options, draft]);

  const addOption = () => {
    const v = newValue.trim();
    if (!v) return;
    if (draft.some(d => d.trim().toLowerCase() === v.toLowerCase())) {
      toast({ title: 'Already in the list', description: `"${v}" is already an option.`, variant: 'destructive' });
      return;
    }
    setDraft(prev => [...prev, v]);
    setNewValue('');
  };

  const persist = async (list: string[]) => {
    try {
      await saveOptions(list.map(v => v.trim()).filter(Boolean));
      toast({ title: 'Business Model options saved' });
      setInUse(null);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e?.message ?? 'Please try again.', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    const cleaned = draft.map(v => v.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast({ title: 'Keep at least one option', variant: 'destructive' });
      return;
    }
    if (removed.length > 0) {
      setChecking(true);
      try {
        const counts = await countDealsUsingBusinessModels(removed);
        if (Object.keys(counts).length > 0) {
          setInUse(counts);
          return;
        }
      } catch (e: any) {
        toast({ title: 'Could not check deals', description: e?.message ?? '', variant: 'destructive' });
        return;
      } finally {
        setChecking(false);
      }
    }
    await persist(cleaned);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Business Model options</DialogTitle>
            <DialogDescription>
              Add, rename or remove the choices shown in the Business Model dropdown on every deal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Add an option..."
            />
            <Button type="button" onClick={addOption} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          <ScrollArea className="h-72 rounded-md border border-border/60">
            <div className="p-2 space-y-1.5">
              {draft.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No options yet — add one above.</p>
              )}
              {draft.map((value, index) => (
                <div key={`${index}-${value}`} className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={e => setDraft(prev => prev.map((v, i) => (i === index ? e.target.value : v)))}
                    className="h-8 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setDraft(prev => prev.filter((_, i) => i !== index))}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${value}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setDraft(getDefaultBusinessModelOptions())}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={isSaving || checking}>
                {checking ? 'Checking deals...' : isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!inUse} onOpenChange={o => { if (!o) setInUse(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>These options are in use</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>The following options are still set on active deals:</p>
                <ul className="list-disc pl-5">
                  {Object.entries(inUse ?? {}).map(([value, count]) => (
                    <li key={value}>
                      <span className="font-medium">{value}</span> — {count} deal{count === 1 ? '' : 's'}
                    </li>
                  ))}
                </ul>
                <p>Removing them from the dropdown keeps the value saved on those deals, but it can no longer be picked. Delete anyway?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep options</AlertDialogCancel>
            <AlertDialogAction onClick={() => persist(draft.map(v => v.trim()).filter(Boolean))}>
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
