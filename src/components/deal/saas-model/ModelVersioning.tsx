import { useState } from 'react';
import { SaaSModelData, SensitivityScenario, LenderConfig } from './types';
import { ModelSnapshot, useModelSnapshots } from '@/hooks/useModelSnapshots';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Save, History, Trash2, RotateCcw, Clock, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  dealId: string;
  model: SaaSModelData;
  scenarios: SensitivityScenario[];
  lenders: LenderConfig[];
  onRestore: (model: SaaSModelData, scenarios: SensitivityScenario[], lenders: LenderConfig[]) => void;
}

export function ModelVersioning({ dealId, model, scenarios, lenders, onRestore }: Props) {
  const { snapshots, isLoading, createSnapshot, deleteSnapshot } = useModelSnapshots(dealId);
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!newLabel.trim()) return;
    setIsSaving(true);
    await createSnapshot(model, scenarios, lenders, newLabel.trim(), newDesc.trim() || undefined);
    setNewLabel('');
    setNewDesc('');
    setIsSaving(false);
  };

  const compareSnapshot = compareId ? snapshots.find(s => s.id === compareId) : null;

  return (
    <div className="space-y-4">
      {/* Create Snapshot */}
      <Card className="border-border/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Save Snapshot</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Save the current state of your financial model. You can restore any snapshot later.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Snapshot label (e.g., 'Pre-IC Review')"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="h-8 text-sm flex-1"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <Button size="sm" onClick={handleSave} disabled={!newLabel.trim() || isSaving} className="gap-1.5 h-8">
              <Save className="h-3.5 w-3.5" />
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <Input
            placeholder="Optional description…"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="h-7 text-xs"
          />
        </CardContent>
      </Card>

      {/* Snapshot History */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Version History</h3>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {isLoading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Loading snapshots…</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No snapshots yet</p>
              <p className="text-[10px] text-muted-foreground/60">Save your first snapshot above</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {snapshots.map((snap) => (
                  <SnapshotRow
                    key={snap.id}
                    snapshot={snap}
                    isComparing={compareId === snap.id}
                    onRestore={() => {
                      if (snap.model_data) {
                        onRestore(
                          snap.model_data,
                          snap.sensitivity_data || scenarios,
                          snap.lender_data || lenders
                        );
                      }
                    }}
                    onCompare={() => setCompareId(compareId === snap.id ? null : snap.id)}
                    onDelete={() => deleteSnapshot(snap.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Comparison Panel */}
      {compareSnapshot && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Comparing: {compareSnapshot.label}</h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setCompareId(null)}>
                Close
              </Button>
            </div>
            <ComparisonTable current={model} snapshot={compareSnapshot.model_data} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SnapshotRow({ snapshot, isComparing, onRestore, onCompare, onDelete }: {
  snapshot: ModelSnapshot;
  isComparing: boolean;
  onRestore: () => void;
  onCompare: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn(
      "p-3 rounded-md border transition-colors",
      isComparing ? "border-primary/40 bg-primary/5" : "border-border/20 hover:border-border/40"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{snapshot.label}</p>
          {snapshot.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{snapshot.description}</p>
          )}
          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={onCompare}>
            {isComparing ? 'Hide' : 'Compare'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-primary">
                <RotateCcw className="h-3 w-3" /> Restore
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore Snapshot?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace the current model data with "{snapshot.label}". Your current state will be overwritten. Consider saving a snapshot first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRestore}>Restore</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComparisonTable({ current, snapshot }: { current: SaaSModelData; snapshot: SaaSModelData }) {
  const metrics = [
    { label: 'ARR', cur: current.arrToday, snap: snapshot.arrToday, fmt: (v: number) => `$${(v / 1e6).toFixed(2)}M` },
    { label: 'Gross Margin', cur: current.latestGrossMargin, snap: snapshot.latestGrossMargin, fmt: (v: number) => `${v.toFixed(1)}%` },
    { label: 'YoY Growth', cur: current.yoyRevGrowth, snap: snapshot.yoyRevGrowth, fmt: (v: number) => `${v.toFixed(1)}%` },
    { label: 'NRR', cur: current.netRevenueRetention, snap: snapshot.netRevenueRetention, fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: 'Borrowing Cap', cur: current.borrowingCapacity, snap: snapshot.borrowingCapacity, fmt: (v: number) => `$${(v / 1e6).toFixed(2)}M` },
    { label: 'Current Ratio', cur: current.currentRatio, snap: snapshot.currentRatio, fmt: (v: number) => `${v.toFixed(2)}x` },
  ];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border/30">
          <th className="text-left py-1.5 font-medium text-muted-foreground">Metric</th>
          <th className="text-right py-1.5 font-medium text-muted-foreground">Current</th>
          <th className="text-right py-1.5 font-medium text-muted-foreground">Snapshot</th>
          <th className="text-right py-1.5 font-medium text-muted-foreground">Δ</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map(m => {
          const delta = m.cur - m.snap;
          return (
            <tr key={m.label} className="border-b border-border/10">
              <td className="py-1.5">{m.label}</td>
              <td className="text-right font-mono">{m.fmt(m.cur)}</td>
              <td className="text-right font-mono text-muted-foreground">{m.fmt(m.snap)}</td>
              <td className={cn("text-right font-mono", delta > 0 ? "text-emerald-500" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                {delta > 0 ? '+' : ''}{m.label.includes('%') || m.label.includes('Ratio') ? delta.toFixed(1) : `$${(delta / 1e6).toFixed(2)}M`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
