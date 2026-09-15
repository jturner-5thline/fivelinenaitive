import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  useBusinessModelOptions,
  getDefaultBusinessModelOptions,
  countDealsUsingBusinessModels,
  countFundingSourcesUsingIndustries,
} from '@/hooks/useBusinessModelOptions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UsageSummary {
  removed: string[];
  added: string[];
  deals: Record<string, number>;
  fundingSources: Record<string, number>;
}

export function BusinessModelOptionsDialog({ open, onOpenChange }: Props) {
  const { options, saveOptions } = useBusinessModelOptions();
  const [draft, setDraft] = useState<string[]>([]);
  const [newValue, setNewValue] = useState('');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

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
      toast({ title: 'Already in the list', description: `"${v}" is already an option.`, variant: 'destructive' });
      return;
    }
    setDraft(prev => [...prev, v]);
    setNewValue('');
  };

  const persist = async () => {
    setSaving(true);
    try {
      await saveOptions(cleanedDraft);
      toast({
        title: 'Options saved',
        description: 'Updated for Business Model on deals and Industries on funding sources.',
      });
      setSummary(null);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (cleanedDraft.length === 0) {
      toast({ title: 'Keep at least one option', variant: 'destructive' });
      return;
    }
    if (removed.length === 0 && added.length === 0) {
      onOpenChange(false);
      return;
    }
    setChecking(true);
    try {
      const [deals, fundingSources] = await Promise.all([
        countDealsUsingBusinessModels(removed),
        countFundingSourcesUsingIndustries(removed),
      ]);
      setSummary({ removed, added, deals, fundingSources });
    } catch (e: any) {
      toast({ title: 'Could not check current usage', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  const inUseRows = summary
    ? summary.removed
        .map(value => ({
          value,
          deals: summary.deals[value] ?? 0,
          sources: summary.fundingSources[value] ?? 0,
        }))
        .filter(r => r.deals > 0 || r.sources > 0)
    : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Business Model / Industry options</DialogTitle>
            <DialogDescription>
              Add, rename or remove the choices shown in the Business Model dropdown on deals.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This is one shared list. Business Model on deals and Industries on funding sources use the
              same options, so adding, renaming or deleting here changes both.
            </span>
          </div>

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
              <Button type="button" onClick={handleSave} disabled={checking || saving}>
                {checking ? 'Checking usage...' : saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!summary} onOpenChange={o => { if (!o) setSummary(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm changes to the shared list</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  These options are used by both the Business Model field on deals and the Industries
                  selection on funding sources. Saving applies the change in both places.
                </p>
                {summary && summary.added.length > 0 && (
                  <p><span className="font-medium">Adding:</span> {summary.added.join(', ')}</p>
                )}
                {summary && summary.removed.length > 0 && (
                  <p><span className="font-medium">Removing:</span> {summary.removed.join(', ')}</p>
                )}
                {inUseRows.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium text-amber-300">Some options you are removing are in use:</p>
                    <ul className="list-disc pl-5">
                      {inUseRows.map(r => (
                        <li key={r.value}>
                          <span className="font-medium">{r.value}</span> — {r.deals} deal{r.deals === 1 ? '' : 's'}, {r.sources} funding source{r.sources === 1 ? '' : 's'}
                        </li>
                      ))}
                    </ul>
                    <p>Existing records keep their saved value, but the option can no longer be picked.</p>
                  </div>
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
