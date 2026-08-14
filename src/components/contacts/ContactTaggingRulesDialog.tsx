import { useState } from 'react';
import { Loader2, Plus, Tags, Trash2, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCompany } from '@/hooks/useCompany';
import { useContactTypes } from '@/hooks/useContactTypes';
import {
  useContactTaggingRules,
  useSaveContactTaggingRule,
  useDeleteContactTaggingRule,
} from '@/hooks/useContactTaggingRules';
import { applyTaggingRules, type ContactTaggingRule } from '@/lib/contactTaggingRules';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BLANK = {
  match_field: 'domain' as 'domain' | 'email',
  match_operator: 'is' as 'is' | 'contains',
  match_value: '',
  tag: '',
};

export function ContactTaggingRulesDialog({ open, onOpenChange }: Props) {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const { data: rules = [], isLoading } = useContactTaggingRules();
  const { data: types = [] } = useContactTypes();
  const saveRule = useSaveContactTaggingRule();
  const deleteRule = useDeleteContactTaggingRule();
  const [draft, setDraft] = useState(BLANK);
  const [running, setRunning] = useState(false);

  const handleAdd = () => {
    if (!draft.match_value.trim() || !draft.tag.trim()) {
      toast.error('Enter a value to match and a tag to apply');
      return;
    }
    saveRule.mutate(
      { ...draft, priority: (rules.length + 1) * 10 },
      { onSuccess: () => setDraft(BLANK) },
    );
  };

  const patch = (rule: ContactTaggingRule, changes: Partial<ContactTaggingRule>) => {
    saveRule.mutate({ ...rule, ...changes } as any);
  };

  const runOnExisting = async () => {
    if (!company?.id) return;
    const active = rules.filter(r => r.is_active);
    if (!active.length) {
      toast.error('No active rules to run');
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, email, website_url, contact_type')
        .eq('company_id', company.id)
        .limit(5000);
      if (error) throw error;
      const updates = (data || [])
        .map(c => ({ id: c.id, next: applyTaggingRules(active, c as any) }))
        .filter(u => !!u.next);
      let updated = 0;
      for (let i = 0; i < updates.length; i += 25) {
        const batch = updates.slice(i, i + 25);
        const results = await Promise.allSettled(
          batch.map(u =>
            supabase.from('contacts').update({ contact_type: u.next as any }).eq('id', u.id),
          ),
        );
        updated += results.filter(r => r.status === 'fulfilled').length;
      }
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(updated ? `Tagged ${updated} contact${updated === 1 ? '' : 's'}` : 'No contacts matched');
    } catch (e: any) {
      toast.error(e.message || 'Failed to apply rules');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" /> Contact tagging rules
          </DialogTitle>
          <DialogDescription>
            Automatically tag contacts when their domain or email matches a rule. Rules run when contacts are
            created or imported, and you can apply them to existing contacts at any time.
          </DialogDescription>
        </DialogHeader>

        {/* New rule */}
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <Label className="text-xs text-muted-foreground">New rule</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={draft.match_field} onValueChange={(v: any) => setDraft(p => ({ ...p, match_field: v }))}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">Domain</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={draft.match_operator} onValueChange={(v: any) => setDraft(p => ({ ...p, match_operator: v }))}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="is">is</SelectItem>
                <SelectItem value="contains">contains</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={draft.match_value}
              onChange={e => setDraft(p => ({ ...p, match_value: e.target.value }))}
              placeholder={draft.match_field === 'domain' ? 'acme.com' : 'name@acme.com'}
              className="h-8 flex-1 min-w-[160px] text-xs"
            />
            <span className="text-xs text-muted-foreground pb-2">tag as</span>
            <Select value={draft.tag} onValueChange={v => setDraft(p => ({ ...p, tag: v }))}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Select tag" /></SelectTrigger>
              <SelectContent>
                {types.map(t => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={handleAdd} disabled={saveRule.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>

        {/* Existing rules */}
        <div className="space-y-2 max-h-[45vh] overflow-y-auto">
          {isLoading && <p className="text-xs text-muted-foreground py-4 text-center">Loading rules…</p>}
          {!isLoading && rules.length === 0 && (
            <p className="text-xs text-muted-foreground py-6 text-center">No tagging rules yet.</p>
          )}
          {rules.map(rule => (
            <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 px-3 py-2">
              <Select value={rule.match_field} onValueChange={(v: any) => patch(rule, { match_field: v })}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={rule.match_operator} onValueChange={(v: any) => patch(rule, { match_operator: v })}>
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="is">is</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                </SelectContent>
              </Select>
              <Input
                defaultValue={rule.match_value}
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v && v !== rule.match_value) patch(rule, { match_value: v });
                }}
                className="h-8 flex-1 min-w-[140px] text-xs"
              />
              <span className="text-xs text-muted-foreground">tag as</span>
              <Select value={rule.tag} onValueChange={v => patch(rule, { tag: v })}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.some(t => t.name === rule.tag) ? null : (
                    <SelectItem value={rule.tag}>{rule.tag}</SelectItem>
                  )}
                  {types.map(t => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Switch checked={rule.is_active} onCheckedChange={c => patch(rule, { is_active: c })} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteRule.mutate(rule.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={runOnExisting} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
            Apply to existing contacts
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
