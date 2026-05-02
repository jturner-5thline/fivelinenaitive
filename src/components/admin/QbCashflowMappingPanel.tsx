import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, Pencil, Loader2, ArrowUp, ArrowDown } from 'lucide-react';

type MatchType = 'include' | 'exclude';
type MatchField = 'account' | 'item' | 'either';

interface MappingRule {
  id: string;
  priority: number;
  match_type: MatchType;
  match_field: MatchField;
  pattern: string;
  target_row: string | null;
  categorized: boolean;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
}

const TARGET_ROW_OPTIONS = [
  'Retainers',
  'Milestones',
  'Closing Fees',
  'Referral Fees',
  'Debt Advisory Revenue',
  'FinServ Revenue',
  'Technology Revenue',
  'Loan Proceeds',
  'Other Receipts',
];

const emptyDraft = (priority: number): Omit<MappingRule, 'id' | 'updated_at'> => ({
  priority,
  match_type: 'include',
  match_field: 'either',
  pattern: '',
  target_row: 'Retainers',
  categorized: true,
  is_active: true,
  notes: '',
});

export function QbCashflowMappingPanel() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<MappingRule>>({});
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState<Omit<MappingRule, 'id' | 'updated_at'>>(emptyDraft(100));

  const { data: rules, isLoading } = useQuery({
    queryKey: ['qb-cashflow-mapping-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qb_cashflow_mapping_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as MappingRule[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['qb-cashflow-mapping-rules'] });
  };

  const updateMutation = useMutation({
    mutationFn: async (rule: Partial<MappingRule> & { id: string }) => {
      const { id, ...rest } = rule;
      const { error } = await supabase
        .from('qb_cashflow_mapping_rules')
        .update({ ...rest, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Rule updated'); setEditingId(null); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update rule'),
  });

  const insertMutation = useMutation({
    mutationFn: async (rule: Omit<MappingRule, 'id' | 'updated_at'>) => {
      if (!rule.pattern.trim()) throw new Error('Pattern is required');
      const { error } = await supabase
        .from('qb_cashflow_mapping_rules')
        .insert({
          ...rule,
          pattern: rule.pattern.trim().toLowerCase(),
          target_row: rule.match_type === 'exclude' ? null : rule.target_row,
          notes: rule.notes || null,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(); toast.success('Rule added');
      setShowNew(false);
      setNewDraft(emptyDraft((rules?.[rules.length - 1]?.priority ?? 90) + 10));
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('qb_cashflow_mapping_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Rule deleted'); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to delete rule'),
  });

  const movePriority = (rule: MappingRule, direction: -1 | 1) => {
    if (!rules) return;
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(r => r.id === rule.id);
    const swap = sorted[idx + direction];
    if (!swap) return;
    updateMutation.mutate({ id: rule.id, priority: swap.priority });
    updateMutation.mutate({ id: swap.id, priority: rule.priority });
  };

  const startEdit = (rule: MappingRule) => {
    setEditingId(rule.id);
    setDraft({ ...rule });
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!(draft.pattern ?? '').toString().trim()) {
      toast.error('Pattern is required'); return;
    }
    updateMutation.mutate({
      id: editingId,
      priority: Number(draft.priority) || 100,
      match_type: draft.match_type as MatchType,
      match_field: draft.match_field as MatchField,
      pattern: (draft.pattern ?? '').toString().trim().toLowerCase(),
      target_row: draft.match_type === 'exclude' ? null : (draft.target_row ?? null),
      categorized: !!draft.categorized,
      is_active: !!draft.is_active,
      notes: (draft.notes ?? '') || null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>QuickBooks → Cash Flow Mapping</CardTitle>
            <CardDescription>
              Rules that map QuickBooks income lines to Cash Flow weekly rows (Retainers, Milestones, Closing Fees, Referral Fees, fallback).
              Rules are evaluated in priority order (low → high); the first match wins. Use <strong>exclude</strong> to drop a line entirely
              (e.g. FinServ revenue), or <strong>include</strong> to route it to a target row. Patterns are matched case-insensitively as substrings.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNew(v => !v)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showNew && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">Priority</label>
                <Input type="number" value={newDraft.priority}
                  onChange={e => setNewDraft({ ...newDraft, priority: Number(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={newDraft.match_type} onValueChange={(v: MatchType) => setNewDraft({ ...newDraft, match_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="include">Include</SelectItem>
                    <SelectItem value="exclude">Exclude</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Match field</label>
                <Select value={newDraft.match_field} onValueChange={(v: MatchField) => setNewDraft({ ...newDraft, match_field: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="either">Account or Item</SelectItem>
                    <SelectItem value="account">Account only</SelectItem>
                    <SelectItem value="item">Item only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <label className="text-xs text-muted-foreground">Pattern (substring)</label>
                <Input value={newDraft.pattern} placeholder="e.g. milestone"
                  onChange={e => setNewDraft({ ...newDraft, pattern: e.target.value })} />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-muted-foreground">Target row</label>
                <Select
                  value={newDraft.target_row ?? ''}
                  disabled={newDraft.match_type === 'exclude'}
                  onValueChange={(v) => setNewDraft({ ...newDraft, target_row: v })}>
                  <SelectTrigger><SelectValue placeholder={newDraft.match_type === 'exclude' ? '— (excluded) —' : 'Choose row'} /></SelectTrigger>
                  <SelectContent>
                    {TARGET_ROW_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex items-center gap-2 pb-1">
                <Switch checked={newDraft.categorized}
                  onCheckedChange={v => setNewDraft({ ...newDraft, categorized: v })} />
                <span className="text-xs">Categorized</span>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-10">
                <label className="text-xs text-muted-foreground">Notes (optional)</label>
                <Input value={newDraft.notes ?? ''} onChange={e => setNewDraft({ ...newDraft, notes: e.target.value })} />
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button size="sm" disabled={insertMutation.isPending} onClick={() => insertMutation.mutate(newDraft)} className="gap-1.5">
                  <Save className="h-4 w-4" /> Save
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-32">Match field</TableHead>
                <TableHead>Pattern</TableHead>
                <TableHead>Target row</TableHead>
                <TableHead className="w-20 text-center">Active</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              )}
              {!isLoading && rules && rules.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No rules yet. The Cash Flow grid will fall back to the built-in defaults.</TableCell></TableRow>
              )}
              {!isLoading && rules?.map((rule, idx) => {
                const isEditing = editingId === rule.id;
                if (isEditing) {
                  return (
                    <TableRow key={rule.id} className="bg-muted/30">
                      <TableCell>
                        <Input type="number" value={draft.priority ?? 0}
                          onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Select value={draft.match_type as string} onValueChange={(v: MatchType) => setDraft({ ...draft, match_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="include">Include</SelectItem>
                            <SelectItem value="exclude">Exclude</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={draft.match_field as string} onValueChange={(v: MatchField) => setDraft({ ...draft, match_field: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="either">Account or Item</SelectItem>
                            <SelectItem value="account">Account only</SelectItem>
                            <SelectItem value="item">Item only</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input value={draft.pattern ?? ''} onChange={e => setDraft({ ...draft, pattern: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={(draft.target_row ?? '') as string}
                          disabled={draft.match_type === 'exclude'}
                          onValueChange={(v) => setDraft({ ...draft, target_row: v })}>
                          <SelectTrigger><SelectValue placeholder={draft.match_type === 'exclude' ? '— (excluded) —' : 'Choose row'} /></SelectTrigger>
                          <SelectContent>
                            {TARGET_ROW_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!draft.is_active} onCheckedChange={v => setDraft({ ...draft, is_active: v })} />
                      </TableCell>
                      <TableCell>
                        <Input value={(draft.notes ?? '') as string} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Save className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <span>{rule.priority}</span>
                        <div className="flex flex-col">
                          <button className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={idx === 0} onClick={() => movePriority(rule, -1)} aria-label="Move up">
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={idx === (rules?.length ?? 0) - 1} onClick={() => movePriority(rule, 1)} aria-label="Move down">
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.match_type === 'exclude' ? 'destructive' : 'secondary'}>
                        {rule.match_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rule.match_field === 'either' ? 'Account or Item' : rule.match_field === 'account' ? 'Account only' : 'Item only'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{rule.pattern}</TableCell>
                    <TableCell>
                      {rule.target_row ? (
                        <span className="flex items-center gap-2">
                          {rule.target_row}
                          {!rule.categorized && <Badge variant="outline" className="text-[10px]">fallback</Badge>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">— excluded —</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={rule.is_active}
                        onCheckedChange={(v) => updateMutation.mutate({ id: rule.id, is_active: v })} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{rule.notes ?? ''}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(rule)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => { if (confirm(`Delete rule "${rule.pattern}"?`)) deleteMutation.mutate(rule.id); }}
                          aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
