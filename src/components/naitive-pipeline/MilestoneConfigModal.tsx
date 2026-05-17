import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Diamond, Settings, Sparkles } from 'lucide-react';
import {
  getAllStageMilestoneConfig,
  setAllStageMilestoneConfig,
  resetStageMilestoneConfig,
  NaitiveMilestoneDef,
} from '@/config/naitiveStageMilestones';
import {
  SYSTEM_STAGE_TYPES,
  SYSTEM_STAGE_LABELS,
  STAGE_DESCRIPTION_DEFAULTS,
  resolveSystemStageType,
  SystemStageType,
} from '@/config/naitivePipelineConfig';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: DealStageOption[];
  saveStages: (next: DealStageOption[]) => Promise<boolean>;
}

type ConfigMap = Record<string, NaitiveMilestoneDef[]>;

const COLOR_OPTIONS = [
  'bg-slate-500', 'bg-zinc-500', 'bg-amber-500', 'bg-blue-500',
  'bg-indigo-500', 'bg-cyan-500', 'bg-violet-500', 'bg-green-500',
  'bg-orange-500', 'bg-red-500', 'bg-pink-500', 'bg-teal-500',
];

function makeKey(label: string) {
  const slug = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `milestone-${Math.random().toString(36).slice(2, 8)}`;
}

function makeStageId(label: string, existing: DealStageOption[]) {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stage';
  let id = base;
  let i = 2;
  while (existing.some((s) => s.id === id)) id = `${base}-${i++}`;
  return id;
}

export function MilestoneConfigModal({ open, onOpenChange, stages, saveStages }: Props) {
  const [activeStageId, setActiveStageId] = useState<string>(stages[0]?.id || '');
  const [milestoneDraft, setMilestoneDraft] = useState<ConfigMap>({});
  const [stagesDraft, setStagesDraft] = useState<DealStageOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMilestoneDraft(getAllStageMilestoneConfig());
      setStagesDraft(stages.map((s) => ({ ...s })));
      if (!stages.find((s) => s.id === activeStageId) && stages[0]) {
        setActiveStageId(stages[0].id);
      }
    }
  }, [open, stages, activeStageId]);

  const activeStage = stagesDraft.find((s) => s.id === activeStageId);
  const currentMilestones = useMemo(() => {
    const list = milestoneDraft[activeStageId] || [];
    return list.slice().sort((a, b) => a.position - b.position);
  }, [milestoneDraft, activeStageId]);

  // Stage editing helpers
  const patchStage = (id: string, patch: Partial<DealStageOption>) => {
    setStagesDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const moveStage = (id: string, dir: -1 | 1) => {
    setStagesDraft((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const addStage = () => {
    setStagesDraft((prev) => {
      const id = makeStageId('new stage', prev);
      const next = [...prev, { id, label: 'New Stage', color: 'bg-slate-500', isActive: true } as DealStageOption];
      setActiveStageId(id);
      return next;
    });
  };
  const deleteStage = (id: string) => {
    setStagesDraft((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === activeStageId && next[0]) setActiveStageId(next[0].id);
      return next;
    });
  };

  // Milestone editing helpers
  const updateMilestones = (next: NaitiveMilestoneDef[]) => {
    setMilestoneDraft((prev) => ({ ...prev, [activeStageId]: next.map((m, i) => ({ ...m, position: i })) }));
  };
  const handleAddMilestone = () => {
    const list = currentMilestones.slice();
    list.push({ key: `new-${Date.now().toString(36)}`, label: 'New milestone', position: list.length, isActive: true });
    updateMilestones(list);
  };
  const handleDeleteMilestone = (idx: number) => {
    const list = currentMilestones.slice();
    list.splice(idx, 1);
    updateMilestones(list);
  };
  const handleMoveMilestone = (idx: number, dir: -1 | 1) => {
    const list = currentMilestones.slice();
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    updateMilestones(list);
  };
  const handleMilestoneField = (idx: number, patch: Partial<NaitiveMilestoneDef>) => {
    const list = currentMilestones.slice();
    const merged = { ...list[idx], ...patch };
    if (patch.label && list[idx].key.startsWith('new-')) merged.key = makeKey(patch.label);
    list[idx] = merged;
    updateMilestones(list);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await saveStages(stagesDraft);
      if (!ok) {
        toast.error('Failed to save stages');
        setSaving(false);
        return;
      }
      setAllStageMilestoneConfig(milestoneDraft);
      toast.success('Pipeline configuration saved');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleResetMilestones = () => {
    resetStageMilestoneConfig();
    setMilestoneDraft(getAllStageMilestoneConfig());
    toast.success('Milestones reset to defaults');
  };

  const handleSeedDescription = () => {
    if (!activeStage) return;
    const type = (activeStage.systemStageType as SystemStageType | undefined) || resolveSystemStageType(activeStage);
    if (!type) {
      toast.error('Set a canonical type first');
      return;
    }
    const seed = STAGE_DESCRIPTION_DEFAULTS[type];
    if (!seed) {
      toast.message('No default description for this type');
      return;
    }
    patchStage(activeStage.id, { description: seed });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 gap-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Diamond className="h-4 w-4 text-primary" />
            Configure Pipeline
          </DialogTitle>
          <DialogDescription>
            Manage stages, descriptions and milestone templates. Changes affect the naitive pipeline board and deal details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Stage nav */}
          <ScrollArea className="w-56 border-r shrink-0">
            <div className="p-2 space-y-0.5">
              {stagesDraft.map((s, idx) => {
                const count = (milestoneDraft[s.id] || []).length;
                return (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveStageId(s.id)}
                      className={cn(
                        'flex-1 text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors min-w-0',
                        activeStageId === s.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                        s.isActive === false && 'opacity-50',
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full shrink-0', s.color)} />
                      <span className="flex-1 truncate">{s.label}</span>
                      {count > 0 && (
                        <span className="text-[10px] text-muted-foreground bg-background border rounded px-1">{count}</span>
                      )}
                    </button>
                    <div className="flex flex-col">
                      <button onClick={() => moveStage(s.id, -1)} disabled={idx === 0}
                        className="h-3 w-4 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30" aria-label="Move stage up">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => moveStage(s.id, 1)} disabled={idx === stagesDraft.length - 1}
                        className="h-3 w-4 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30" aria-label="Move stage down">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5" onClick={addStage}>
                <Plus className="h-3.5 w-3.5" /> Add stage
              </Button>
            </div>
          </ScrollArea>

          {/* Right pane */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!activeStage ? (
              <div className="p-6 text-sm text-muted-foreground">Select a stage.</div>
            ) : (
              <Tabs defaultValue="stage" className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-5 mt-4 self-start">
                  <TabsTrigger value="stage" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" /> Stage Settings
                  </TabsTrigger>
                  <TabsTrigger value="milestones" className="gap-1.5">
                    <Diamond className="h-3.5 w-3.5" /> Milestones
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="stage" className="flex-1 min-h-0 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Label</Label>
                          <Input
                            value={activeStage.label}
                            onChange={(e) => patchStage(activeStage.id, { label: e.target.value })}
                            maxLength={60}
                            className="h-8 text-sm mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Canonical type</Label>
                          <Select
                            value={activeStage.systemStageType || '__auto__'}
                            onValueChange={(v) => patchStage(activeStage.id, { systemStageType: v === '__auto__' ? undefined : v })}
                          >
                            <SelectTrigger className="h-8 text-sm mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">Auto (resolve from label)</SelectItem>
                              {SYSTEM_STAGE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{SYSTEM_STAGE_LABELS[t]} ({t})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Color</Label>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {COLOR_OPTIONS.map((c) => (
                              <button
                                key={c}
                                onClick={() => patchStage(activeStage.id, { color: c })}
                                className={cn(
                                  'h-6 w-6 rounded-full border-2 transition-all',
                                  c,
                                  activeStage.color === c ? 'border-foreground scale-110' : 'border-transparent',
                                )}
                                aria-label={`Set color ${c}`}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={activeStage.isActive !== false}
                              onCheckedChange={(v) => patchStage(activeStage.id, { isActive: v })}
                            />
                            Active
                          </label>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs">Description</Label>
                          <Button variant="ghost" size="sm" onClick={handleSeedDescription} className="h-6 gap-1.5 text-xs">
                            <Sparkles className="h-3 w-3" /> Use canonical default
                          </Button>
                        </div>
                        <Textarea
                          value={activeStage.description || ''}
                          onChange={(e) => patchStage(activeStage.id, { description: e.target.value })}
                          placeholder="Shown on the column header tooltip and the deal details stage section."
                          maxLength={1000}
                          className="text-sm min-h-[140px]"
                        />
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button variant="ghost" size="sm" onClick={() => deleteStage(activeStage.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete stage
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="milestones" className="flex-1 min-h-0 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-3">
                      {currentMilestones.length === 0 ? (
                        <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                          No milestones for this stage yet.
                        </div>
                      ) : (
                        currentMilestones.map((m, idx) => (
                          <div key={`${m.key}-${idx}`} className="border rounded-lg p-3 space-y-2.5 bg-card/50">
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col">
                                <button onClick={() => handleMoveMilestone(idx, -1)} disabled={idx === 0}
                                  className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30" aria-label="Move up">
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleMoveMilestone(idx, 1)} disabled={idx === currentMilestones.length - 1}
                                  className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30" aria-label="Move down">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">Label</Label>
                                    <Input value={m.label} onChange={(e) => handleMilestoneField(idx, { label: e.target.value })} maxLength={120} className="h-8 text-sm mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">On complete, move deal to</Label>
                                    <Select
                                      value={m.outcomeTargetStage || '__none__'}
                                      onValueChange={(v) => handleMilestoneField(idx, { outcomeTargetStage: v === '__none__' ? undefined : v })}
                                    >
                                      <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">No stage change</SelectItem>
                                        {stagesDraft.map((s) => (
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
                                    onChange={(e) => handleMilestoneField(idx, { description: e.target.value })}
                                    placeholder="Shown on hover and in the deal details view"
                                    maxLength={500}
                                    className="text-sm mt-1 min-h-[60px]"
                                  />
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Switch checked={m.isActive !== false} onCheckedChange={(v) => handleMilestoneField(idx, { isActive: v })} />
                                    Active
                                  </label>
                                  <Button variant="ghost" size="sm" onClick={() => handleDeleteMilestone(idx)} className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <Button variant="outline" size="sm" onClick={handleAddMilestone} className="w-full gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Add milestone
                      </Button>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={handleResetMilestones} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset milestones
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
