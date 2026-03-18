import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, Brain, MessageSquareWarning, Terminal, Pencil, Check, X } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { format } from 'date-fns';

type PreferenceCategory = 'formatting' | 'terminology' | 'behavior' | 'domain_knowledge';
type PreferenceSource = 'manual' | 'thumbs_down' | 'chat_command';

interface CopilotPreference {
  id: string;
  organization_id: string;
  rule_text: string;
  category: PreferenceCategory;
  source: PreferenceSource;
  is_active: boolean;
  original_ai_response: string | null;
  user_correction: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const categoryLabels: Record<PreferenceCategory, string> = {
  formatting: 'Formatting',
  terminology: 'Terminology',
  behavior: 'Behavior',
  domain_knowledge: 'Domain Knowledge',
};

const categoryColors: Record<PreferenceCategory, string> = {
  formatting: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  terminology: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  behavior: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  domain_knowledge: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const sourceIcons: Record<PreferenceSource, typeof Brain> = {
  manual: Pencil,
  thumbs_down: MessageSquareWarning,
  chat_command: Terminal,
};

const sourceLabels: Record<PreferenceSource, string> = {
  manual: 'Manual',
  thumbs_down: 'Thumbs-down',
  chat_command: 'Chat command',
};

export function AIRulesPanel() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [newCategory, setNewCategory] = useState<PreferenceCategory>('behavior');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [filterSource, setFilterSource] = useState<string>('all');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['copilot-preferences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('copilot_user_preferences')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CopilotPreference[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ rule_text, category }: { rule_text: string; category: PreferenceCategory }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's company
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      if (!member) throw new Error('No company found');

      const { error } = await supabase.from('copilot_user_preferences').insert({
        organization_id: member.company_id,
        rule_text,
        category,
        source: 'manual',
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['copilot-preferences'] });
      setNewRule('');
      setShowAdd(false);
      toast.success('Rule added');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to add rule'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('copilot_user_preferences')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['copilot-preferences'] }),
    onError: () => toast.error('Failed to update rule'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, rule_text }: { id: string; rule_text: string }) => {
      const { error } = await supabase
        .from('copilot_user_preferences')
        .update({ rule_text })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['copilot-preferences'] });
      setEditingId(null);
      toast.success('Rule updated');
    },
    onError: () => toast.error('Failed to update rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('copilot_user_preferences')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['copilot-preferences'] });
      toast.success('Rule deleted');
    },
    onError: () => toast.error('Failed to delete rule'),
  });

  const filteredRules = filterSource === 'all'
    ? rules
    : rules.filter(r => r.source === filterSource);

  const activeCount = rules.filter(r => r.is_active).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{rules.length}</div>
            <div className="text-xs text-muted-foreground">Total Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-primary">{activeCount}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-amber-400">{rules.filter(r => r.source === 'thumbs_down').length}</div>
            <div className="text-xs text-muted-foreground">From Corrections</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="thumbs_down">Thumbs-down</SelectItem>
            <SelectItem value="chat_command">Chat Command</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Rule
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <Textarea
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder='e.g., "Always show deal values in millions", "Refer to our company as 5th Line not Fifth Line"'
              rows={2}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v as PreferenceCategory)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formatting">Formatting</SelectItem>
                  <SelectItem value="terminology">Terminology</SelectItem>
                  <SelectItem value="behavior">Behavior</SelectItem>
                  <SelectItem value="domain_knowledge">Domain Knowledge</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setNewRule(''); }}>Cancel</Button>
              <Button size="sm" disabled={!newRule.trim()} onClick={() => addMutation.mutate({ rule_text: newRule.trim(), category: newCategory })}>
                Save Rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules Table */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading rules...</div>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No AI rules yet. Add rules to customize how the AI responds.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Active</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[110px]">Source</TableHead>
                <TableHead className="w-[100px]">Created</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.map((rule) => {
                const SourceIcon = sourceIcons[rule.source];
                return (
                  <TableRow key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      {editingId === rule.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="text-sm"
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateMutation.mutate({ id: rule.id, rule_text: editText })}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm">{rule.rule_text}</p>
                          {rule.source === 'thumbs_down' && rule.user_correction && (
                            <p className="text-xs text-muted-foreground mt-1">
                              User correction: "{rule.user_correction}"
                            </p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${categoryColors[rule.category]}`}>
                        {categoryLabels[rule.category]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <SourceIcon className="h-3.5 w-3.5" />
                        {sourceLabels[rule.source]}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(rule.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => { setEditingId(rule.id); setEditText(rule.rule_text); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteMutation.mutate(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
