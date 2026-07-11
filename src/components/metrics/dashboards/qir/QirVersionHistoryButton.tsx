import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Version {
  id: string;
  content: any;
  source: string;
  saved_by_name: string | null;
  created_at: string;
}

interface Props {
  companyId: string | undefined;
  configKey: string;
  onRestore: (content: any) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Compact "Version history" control for the JT/JM/SW Quarterly Insights
 * reports. Every save (manual or debounced autosave) writes a snapshot to
 * `qir_report_versions`; this dialog lets any company member browse those
 * snapshots and restore one back into the live report.
 */
export function QirVersionHistoryButton({ companyId, configKey, onRestore, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !configKey) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('qir_report_versions' as any)
        .select('id, content, source, saved_by_name, created_at')
        .eq('company_id', companyId)
        .eq('report_key', configKey)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setVersions((data as unknown as Version[]) || []);
    } catch (err: any) {
      console.error('[QIR history] load failed', err);
      toast.error('Could not load version history');
    } finally {
      setLoading(false);
    }
  }, [companyId, configKey]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const selected = versions.find(v => v.id === selectedId) || null;

  const handleRestore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await onRestore(selected.content);
      toast.success('Version restored — remember to Save to keep it');
      setOpen(false);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="View saved versions of this report"
      >
        <History className="h-3.5 w-3.5" />
        Version history
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[240px_1fr] gap-3 min-h-[360px]">
            <div className="border rounded-md bg-background/40">
              <ScrollArea className="h-[360px]">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading…
                  </div>
                ) : versions.length === 0 ? (
                  <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                    No saved versions yet. Versions are captured every time this report is saved.
                  </div>
                ) : versions.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/40 transition ${selectedId === v.id ? 'bg-muted/60' : ''}`}
                  >
                    <div className="text-xs font-medium">
                      {format(new Date(v.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {v.saved_by_name || 'Unknown'} · {v.source}
                    </div>
                  </button>
                ))}
              </ScrollArea>
            </div>
            <div className="border rounded-md bg-background/40 p-3 overflow-hidden">
              {selected ? (
                <div className="space-y-2 h-full flex flex-col">
                  <div className="text-xs text-muted-foreground">
                    Preview of snapshot taken {format(new Date(selected.created_at), 'PPpp')}
                  </div>
                  <ScrollArea className="flex-1 border rounded bg-muted/20">
                    <pre className="text-[10px] whitespace-pre-wrap p-2 font-mono">
                      {JSON.stringify(selected.content, null, 2).slice(0, 8000)}
                    </pre>
                  </ScrollArea>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-6">
                  Select a version on the left to preview and restore it.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleRestore} disabled={!selected || restoring} className="gap-1.5">
              {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Restore this version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}