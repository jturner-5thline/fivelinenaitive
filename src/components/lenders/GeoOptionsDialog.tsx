import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGeoOptionsList,
  getDefaultGeoOptions,
  useSaveGeoOptions,
  countFundingSourcesUsingGeographies,
} from '@/lib/geoOptionsStore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Summary {
  added: string[];
  removed: string[];
  usage: Record<string, number>;
}

export function GeoOptionsDialog({ open, onOpenChange }: Props) {
  const options = useGeoOptionsList();
  const saveGeoOptions = useSaveGeoOptions();
  const [draft, setDraft] = useState<string[]>([]);
  const [newValue, setNewValue] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft([...options]);
      setNewValue('');
      setSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cleanedDraft = useMemo(() => draft.map(v => v.trim()).filter(Boolean), [draft]);

  const removed = useMemo(() => {
    const keys = new Set(cleanedDraft.map(v => v.toLowerCase()));
    return options.filter(v => !keys.has(v.trim().toLowerCase()));
  }, [options, cleanedDraft]);

  const added = useMemo(() => {
    const keys = new Set(options.map(v => v.trim().toLowerCase()));
    return cleanedDraft.filter(v => !keys.has(v.toLowerCase()));
  }, [options, cleanedDraft]);

  const addOption = () => {
    const v = newValue.trim();
    if (!v) return;
    if (draft.some(d => d.trim().toLowerCase() === v.toLowerCase())) {
      toast.error(`"${v}" is already an option.`);
      return;
    }
    setDraft(prev => [...prev, v]);
    setNewValue('');
  };

  const handleSave = async () => {
    if (cleanedDraft.length === 0) {
      toast.error('Keep at least one option.');
      return;
    }
    if (added.length === 0 && removed.length === 0) {
      onOpenChange(false);
      return;
    }
    setChecking(true);
    try {
      const usage = await countFundingSourcesUsingGeographies(removed);
      setSummary({ added, removed, usage });
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not check current usage.');
    } finally {
      setChecking(false);
    }
  };

  const persist = async () => {
    try {
      await saveGeoOptions(cleanedDraft);
      toast.success('Geographic preference options saved.');
      setSummary(null);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save options.');
    }
  };

  const inUseRows = summary
    ? summary.removed.map(v => ({ value: v, count: summary.usage[v] ?? 0 })).filter(r => r.count > 0)
    : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md z-[10000]">
          <DialogHeader>
            <DialogTitle>Geographic Preference options</DialogTitle>
            <DialogDescription>
              Add, rename or remove the regions available in the Geographic Preference dropdown.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Add a region..."
            />
            <Button type="button" onClick={addOption} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          <ScrollArea className="h-64 rounded-md border border-border/60">
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
            <Button type="button" variant="ghost" className="gap-1.5" onClick={() => setDraft(getDefaultGeoOptions())}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={checking}>
                {checking ? 'Checking usage...' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!summary} onOpenChange={o => { if (!o) setSummary(null); }}>
        <AlertDialogContent className="z-[10001]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm geographic preference changes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {summary && summary.added.length > 0 && (
                  <p><span className="font-medium">Adding:</span> {summary.added.join(', ')}</p>
                )}
                {summary && summary.removed.length > 0 && (
                  <p><span className="font-medium">Removing:</span> {summary.removed.join(', ')}</p>
                )}
                {inUseRows.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-medium text-amber-300">Some regions you are removing are currently selected:</p>
                    <ul className="list-disc pl-5">
                      {inUseRows.map(r => (
                        <li key={r.value}>
                          <span className="font-medium">{r.value}</span> — {r.count} funding source{r.count === 1 ? '' : 's'}
                        </li>
                      ))}
                    </ul>
                    <p>Those funding sources keep their saved regions, but the option can no longer be picked.</p>
                  </div>
                ) : (
                  summary && summary.removed.length > 0 && (
                    <p>None of the removed regions are currently selected on any funding source.</p>
                  )
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={persist}>Save changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
