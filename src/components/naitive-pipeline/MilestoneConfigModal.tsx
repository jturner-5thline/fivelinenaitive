import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Diamond } from 'lucide-react';
import {
  getAllStageMilestoneConfig,
  setAllStageMilestoneConfig,
  resetStageMilestoneConfig,
  NaitiveMilestoneDef,
} from '@/config/naitiveStageMilestones';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: DealStageOption[];
}

type ConfigMap = Record<string, NaitiveMilestoneDef[]>;

function makeKey(label: string) {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `milestone-${Math.random().toString(36).slice(2, 8)}`;
}

export function MilestoneConfigModal({ open, onOpenChange, stages }: Props) {
  const [activeStageId, setActiveStageId] = useState<string>(stages[0]?.id || '');
  const [draft, setDraft] = useState<ConfigMap>({});

  useEffect(() => {
    if (open) {
      setDraft(getAllStageMilestoneConfig());
      if (!activeStageId && stages[0]) setActiveStageId(stages[0].id);
    }
  }, [open, stages, activeStageId]);

  const currentList = useMemo(() => {
    const list = draft[activeStageId] || [];
    return list.slice().sort((a, b) => a.position - b.position);
  }, [draft, activeStageId]);

  const update = (next: NaitiveMilestoneDef[]) => {
    setDraft((prev) => ({ ...prev, [activeStageId]: next.map((m, i) => ({ ...m, position: i })) }));
  };

  const handleAdd = () => {
    const list = currentList.slice();
    list.push({
      key: `new-${Date.now().toString(36)}`,
      label: 'New milestone',
      position: list.length,
      isActive: true,
    });
    update(list);
  };

  const handleDelete = (idx: number) => {
    const list = currentList.slice();
    list.splice(idx, 1);
    update(list);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const list = currentList.slice();
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    update(list);
  };

  const handleField = (idx: number, patch: Partial<NaitiveMilestoneDef>) => {
    const list = currentList.slice();
    const merged = { ...list[idx], ...patch };
    // Keep key in sync with label only if it's still auto-generated
    if (patch.label && list[idx].key.startsWith('new-')) {
      merged.key = makeKey(patch.label);
    }
    list[idx] = merged;
    update(list);
  };

  const handleSave = () => {
    setAllStageMilestoneConfig(draft);
    toast.success('Milestones saved');
    onOpenChange(false);
  };

  const handleReset = () => {
    resetStageMilestoneConfig();
    setDraft(getAllStageMilestoneConfig());
    toast.success('Milestones reset to defaults');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Diamond className="h-4 w-4 text-primary" />
            Configure Stage Milestones
          </DialogTitle>
          <DialogDescription>
            Define milestones per pipeline stage. Outcome milestones automatically move the deal to a destination stage when completed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Stage nav */}
          <ScrollArea className="w-48 border-r shrink-0">
            <div className="p-2 space-y-0.5">
              {stages.map((s) => {
                const count = (draft[s.id] || []).length;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveStageId(s.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors',
                      activeStageId === s.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', s.color)} />
                    <span className="flex-1 truncate">{s.label}</span>
                    {count > 0 && (
                      <span className="text-[10px] text-muted-foreground bg-background border rounded px-1">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Milestone editor */}
          <ScrollArea className="flex-1 min-w-0">
            <div className="p-5 space-y-3">
              {currentList.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                  No milestones for this stage yet.
                </div>
              ) : (
                currentList.map((m, idx) => (
                  <div key={`${m.key}-${idx}`} className="border rounded-lg p-3 space-y-2.5 bg-card/50">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleMove(idx, -1)}
                          disabled={idx === 0}
                          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleMove(idx, 1)}
                          disabled={idx === currentList.length - 1}
                          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Label</Label>
                            <Input
                              value={m.label}
                              onChange={(e) => handleField(idx, { label: e.target.value })}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">On complete, move deal to</Label>
                            <Select
                              value={m.outcomeTargetStage || '__none__'}
                              onValueChange={(v) => handleField(idx, { outcomeTargetStage: v === '__none__' ? undefined : v })}
                            >
                              <SelectTrigger className="h-8 text-sm mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No stage change</SelectItem>
                                {stages.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Description (optional)</Label>
                          <Textarea
                            value={m.description || ''}
                            onChange={(e) => handleField(idx, { description: e.target.value })}
                            placeholder="Shown on hover and in the deal details view"
                            className="text-sm mt-1 min-h-[60px]"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={m.isActive !== false}
                              onCheckedChange={(v) => handleField(idx, { isActive: v })}
                            />
                            Active
                          </label>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(idx)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <Button variant="outline" size="sm" onClick={handleAdd} className="w-full gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add milestone
              </Button>
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
