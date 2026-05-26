import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, Save, Loader2, FileText, GripVertical, Pencil, ChevronRight, AlertCircle, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  useDefaultChecklistConfig,
  getDefaultSeedConfig,
  genId,
  type DefaultChecklistConfigV2,
  type DealTypeChecklistConfig,
  type RoundConfig,
  type ChecklistItemConfig,
} from '@/hooks/useDefaultChecklistConfig';
import { useCompany } from '@/hooks/useCompany';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface DefaultChecklistSettingsProps {
  isAdmin?: boolean;
  embedded?: boolean;
}

export function DefaultChecklistSettings({ isAdmin = true, embedded = false }: DefaultChecklistSettingsProps) {
  const { company } = useCompany();
  const { config, loading, saveConfig } = useDefaultChecklistConfig(company?.id);
  const { dealTypes: availableDealTypes } = useDealTypes();
  const [isOpen, setIsOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<DefaultChecklistConfigV2>({ version: 2, configs: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());

  // Dialog state
  const [addConfigOpen, setAddConfigOpen] = useState(false);
  const [newMatchString, setNewMatchString] = useState('');
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const [editMatchString, setEditMatchString] = useState('');
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null);

  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [newRoundTitle, setNewRoundTitle] = useState('');
  const [editRoundId, setEditRoundId] = useState<string | null>(null);
  const [editRoundTitle, setEditRoundTitle] = useState('');
  const [deleteRoundId, setDeleteRoundId] = useState<string | null>(null);

  const [addItemRoundId, setAddItemRoundId] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemLabel, setEditItemLabel] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemRequired, setEditItemRequired] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  useEffect(() => { setLocalConfig(config); }, [config]);
  useEffect(() => {
    if (!selectedConfigId && localConfig.configs.length > 0) {
      setSelectedConfigId(localConfig.configs[0].id);
    }
  }, [localConfig.configs, selectedConfigId]);

  const selectedConfig = localConfig.configs.find(c => c.id === selectedConfigId) || null;
  const usedLabels = new Set(localConfig.configs.map(c => c.dealTypeMatchString.toLowerCase()));
  const availableForAdd = availableDealTypes.filter(dt => !usedLabels.has(dt.label.toLowerCase()));
  const availableForEdit = (currentLabel: string) => availableDealTypes.filter(
    dt => dt.label.toLowerCase() === currentLabel.toLowerCase() || !usedLabels.has(dt.label.toLowerCase())
  );
  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config);

  const updateLocal = useCallback((updater: (draft: DefaultChecklistConfigV2) => void) => {
    setLocalConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as DefaultChecklistConfigV2;
      updater(next);
      return next;
    });
  }, []);

  // ── Config (deal type) CRUD ──
  const handleAddConfig = () => {
    const label = newMatchString.trim();
    if (!label) return;
    // Must be a configured deal type
    if (!availableDealTypes.some(dt => dt.label.toLowerCase() === label.toLowerCase())) {
      toast.error('Please select a configured Deal Type.');
      return;
    }
    // Prevent duplicates
    if (usedLabels.has(label.toLowerCase())) {
      toast.error('A checklist for this Deal Type already exists.');
      return;
    }
    updateLocal(d => {
      d.configs.push({ id: genId(), dealTypeMatchString: label, rounds: [] });
    });
    setNewMatchString('');
    setAddConfigOpen(false);
  };

  const handleEditConfig = () => {
    const label = editMatchString.trim();
    if (!editConfigId || !label) return;
    if (!availableDealTypes.some(dt => dt.label.toLowerCase() === label.toLowerCase())) {
      toast.error('Please select a configured Deal Type.');
      return;
    }
    const dup = localConfig.configs.some(
      c => c.id !== editConfigId && c.dealTypeMatchString.toLowerCase() === label.toLowerCase(),
    );
    if (dup) {
      toast.error('A checklist for this Deal Type already exists.');
      return;
    }
    updateLocal(d => {
      const c = d.configs.find(x => x.id === editConfigId);
      if (c) c.dealTypeMatchString = label;
    });
    setEditConfigId(null);
  };

  const handleDeleteConfig = () => {
    if (!deleteConfigId) return;
    updateLocal(d => { d.configs = d.configs.filter(x => x.id !== deleteConfigId); });
    if (selectedConfigId === deleteConfigId) setSelectedConfigId(null);
    setDeleteConfigId(null);
  };

  // ── Round CRUD ──
  const handleAddRound = () => {
    if (!selectedConfigId || !newRoundTitle.trim()) return;
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      if (!c) return;
      const maxOrder = c.rounds.reduce((m, r) => Math.max(m, r.order), -1);
      const newId = genId();
      c.rounds.push({ id: newId, title: newRoundTitle.trim(), order: maxOrder + 1, items: [] });
      setExpandedRounds(prev => new Set([...prev, newId]));
    });
    setNewRoundTitle('');
    setAddRoundOpen(false);
  };

  const handleEditRound = () => {
    if (!editRoundId || !editRoundTitle.trim() || !selectedConfig) return;
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      const r = c?.rounds.find(x => x.id === editRoundId);
      if (r) r.title = editRoundTitle.trim();
    });
    setEditRoundId(null);
  };

  const handleDeleteRound = () => {
    if (!deleteRoundId || !selectedConfigId) return;
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      if (c) c.rounds = c.rounds.filter(x => x.id !== deleteRoundId);
    });
    setDeleteRoundId(null);
  };

  // ── Item CRUD ──
  const handleAddItem = () => {
    if (!addItemRoundId || !newItemLabel.trim() || !selectedConfigId) return;
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      const r = c?.rounds.find(x => x.id === addItemRoundId);
      if (!r) return;
      const maxOrder = r.items.reduce((m, i) => Math.max(m, i.order), -1);
      r.items.push({
        id: genId(),
        label: newItemLabel.trim(),
        description: newItemDesc.trim() || undefined,
        order: maxOrder + 1,
        required: newItemRequired,
      });
    });
    setNewItemLabel('');
    setNewItemDesc('');
    setNewItemRequired(false);
    setAddItemRoundId(null);
  };

  const handleEditItem = () => {
    if (!editItemId || !editItemLabel.trim() || !selectedConfigId) return;
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      for (const r of c?.rounds || []) {
        const item = r.items.find(i => i.id === editItemId);
        if (item) {
          item.label = editItemLabel.trim();
          item.description = editItemDesc.trim() || undefined;
          item.required = editItemRequired;
          break;
        }
      }
    });
    setEditItemId(null);
  };

  const handleDeleteItem = () => {
    if (!deleteItemId || !selectedConfigId) return;
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      for (const r of c?.rounds || []) {
        r.items = r.items.filter(i => i.id !== deleteItemId);
      }
    });
    setDeleteItemId(null);
  };

  const toggleRequiredItem = (roundId: string, itemId: string) => {
    updateLocal(d => {
      const c = d.configs.find(x => x.id === selectedConfigId);
      const r = c?.rounds.find(x => x.id === roundId);
      const item = r?.items.find(i => i.id === itemId);
      if (item) item.required = !item.required;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    await saveConfig(localConfig);
    setIsSaving(false);
  };

  const handleSeedDefaults = () => {
    const seed = getDefaultSeedConfig();
    setLocalConfig(seed);
    if (seed.configs.length > 0) setSelectedConfigId(seed.configs[0].id);
    toast.info('Default seed configuration loaded. Click Save to persist.');
  };

  const toggleRound = (roundId: string) => {
    setExpandedRounds(prev => {
      const next = new Set(prev);
      next.has(roundId) ? next.delete(roundId) : next.add(roundId);
      return next;
    });
  };

  if (!isAdmin) return null;

  const totalItems = localConfig.configs.reduce(
    (sum, c) => sum + c.rounds.reduce((rs, r) => rs + r.items.length, 0), 0
  );

  const innerContent = (
            <div className="space-y-4">
              {/* Deal type config selector */}
              <div className="flex items-center gap-2 flex-wrap">
                {localConfig.configs.map(c => (
                  <Button
                    key={c.id}
                    variant={selectedConfigId === c.id ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSelectedConfigId(c.id)}
                  >
                    {c.dealTypeMatchString}
                    <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1">
                      {c.rounds.reduce((s, r) => s + r.items.length, 0)}
                    </Badge>
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setAddConfigOpen(true)}>
                  <Plus className="h-3 w-3" /> Add Deal Type
                </Button>
                {localConfig.configs.length === 0 && (
                  <Button variant="secondary" size="sm" className="gap-1" onClick={handleSeedDefaults}>
                    <FileText className="h-3 w-3" /> Load Default Seed
                  </Button>
                )}
              </div>

              {selectedConfig && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Match string:</span>
                      <Badge variant="outline">{selectedConfig.dealTypeMatchString}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setEditConfigId(selectedConfig.id);
                        setEditMatchString(selectedConfig.dealTypeMatchString);
                      }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteConfigId(selectedConfig.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddRoundOpen(true)}>
                      <Plus className="h-3 w-3" /> Add Round
                    </Button>
                  </div>

                  <Separator />

                  {/* Rounds */}
                  {selectedConfig.rounds.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No rounds yet. Add a round to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...selectedConfig.rounds].sort((a, b) => a.order - b.order).map(round => {
                        const isExpanded = expandedRounds.has(round.id);
                        const sortedItems = [...round.items].sort((a, b) => a.order - b.order);
                        return (
                          <div key={round.id} className="border rounded-lg overflow-hidden">
                            {/* Round header */}
                            <div
                              className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => toggleRound(round.id)}
                            >
                              <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && 'rotate-90')} />
                              <span className="font-medium text-sm flex-1">{round.title}</span>
                              <Badge variant="secondary" className="text-[10px] h-4">{round.items.length} items</Badge>
                              <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                  setEditRoundId(round.id);
                                  setEditRoundTitle(round.title);
                                }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteRoundId(round.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* Round items */}
                            {isExpanded && (
                              <div className="px-3 py-2 space-y-1">
                                {sortedItems.map(item => (
                                  <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/20 group text-sm">
                                    <span className="flex-1 truncate">{item.label}</span>
                                    {item.description && (
                                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.description}</span>
                                    )}
                                    {item.required && (
                                      <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5">
                                        <AlertCircle className="h-2.5 w-2.5" /> REQ
                                      </Badge>
                                    )}
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleRequiredItem(round.id, item.id)}>
                                        <span className="text-[9px]">{item.required ? 'OPT' : 'REQ'}</span>
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                        setEditItemId(item.id);
                                        setEditItemLabel(item.label);
                                        setEditItemDesc(item.description || '');
                                        setEditItemRequired(item.required);
                                      }}>
                                        <Pencil className="h-2.5 w-2.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setDeleteItemId(item.id)}>
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}

                                {/* Quick-add item inline */}
                                <div className="flex items-center gap-2 pt-1">
                                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={() => {
                                    setAddItemRoundId(round.id);
                                    setNewItemLabel('');
                                    setNewItemDesc('');
                                    setNewItemRequired(false);
                                  }}>
                                    <Plus className="h-3 w-3" /> Add Item
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Save bar */}
              {hasChanges && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground">You have unsaved changes</p>
                  <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
  );

  return (
    <>
      {embedded ? (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            Configure default checklist rounds &amp; items per deal type (matched by &quot;contains&quot;).
            {' '}{localConfig.configs.length} types, {totalItems} total items
          </p>
          {innerContent}
        </div>
      ) : (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left flex-1">
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && 'rotate-180')} />
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Deal-Type Data Room Checklists
                  </CardTitle>
                  <CardDescription>
                    Configure default checklist rounds &amp; items per deal type (matched by &quot;contains&quot;).
                    {' '}{localConfig.configs.length} types, {totalItems} total items
                  </CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent>
              {innerContent}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      )}

      {/* ─── Dialogs ─── */}

      {/* Add deal type config */}
      <Dialog open={addConfigOpen} onOpenChange={setAddConfigOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Deal Type Checklist</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Match String (e.g. &quot;Growth Capital&quot;)</Label>
            <Input value={newMatchString} onChange={e => setNewMatchString(e.target.value)} placeholder="Growth Capital"
              onKeyDown={e => e.key === 'Enter' && handleAddConfig()} />
            <p className="text-[11px] text-muted-foreground">Deals whose type contains this string will use this checklist.</p>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddConfig} disabled={!newMatchString.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit deal type match string */}
      <Dialog open={!!editConfigId} onOpenChange={o => !o && setEditConfigId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Match String</DialogTitle></DialogHeader>
          <Input value={editMatchString} onChange={e => setEditMatchString(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEditConfig()} />
          <DialogFooter>
            <Button size="sm" onClick={handleEditConfig} disabled={!editMatchString.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete deal type */}
      <AlertDialog open={!!deleteConfigId} onOpenChange={o => !o && setDeleteConfigId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deal Type Checklist?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the entire configuration including all rounds and items.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfig}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add round */}
      <Dialog open={addRoundOpen} onOpenChange={setAddRoundOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Round</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Round Title</Label>
            <Input value={newRoundTitle} onChange={e => setNewRoundTitle(e.target.value)} placeholder="e.g. Kick Off"
              onKeyDown={e => e.key === 'Enter' && handleAddRound()} />
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddRound} disabled={!newRoundTitle.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit round */}
      <Dialog open={!!editRoundId} onOpenChange={o => !o && setEditRoundId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Round Title</DialogTitle></DialogHeader>
          <Input value={editRoundTitle} onChange={e => setEditRoundTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEditRound()} />
          <DialogFooter>
            <Button size="sm" onClick={handleEditRound} disabled={!editRoundTitle.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete round */}
      <AlertDialog open={!!deleteRoundId} onOpenChange={o => !o && setDeleteRoundId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Round?</AlertDialogTitle>
            <AlertDialogDescription>All items in this round will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRound}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add item */}
      <Dialog open={!!addItemRoundId} onOpenChange={o => !o && setAddItemRoundId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Checklist Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} placeholder="e.g. Pitch Deck"
                onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={newItemRequired} onCheckedChange={c => setNewItemRequired(!!c)} />
              <Label className="text-xs">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddItem} disabled={!newItemLabel.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit item */}
      <Dialog open={!!editItemId} onOpenChange={o => !o && setEditItemId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Checklist Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input value={editItemLabel} onChange={e => setEditItemLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEditItem()} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={editItemDesc} onChange={e => setEditItemDesc(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={editItemRequired} onCheckedChange={c => setEditItemRequired(!!c)} />
              <Label className="text-xs">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleEditItem} disabled={!editItemLabel.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete item */}
      <AlertDialog open={!!deleteItemId} onOpenChange={o => !o && setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>This checklist item will be removed from the round.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
