import { useState } from 'react';
import { Plus, Trash2, Clock, AlertTriangle, Loader2, Bell, Hash, ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SLARule {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  conditions: any;
  action_type: string;
  action_config: any;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
}

const RULE_TYPES = [
  { id: 'stale_deal', label: 'Stale Deal Alert', description: 'Alert when deals have no activity for X days' },
  { id: 'stage_timeout', label: 'Stage Timeout', description: 'Alert when deals stay in a stage too long' },
  { id: 'lender_response', label: 'Lender Response SLA', description: 'Alert when lenders haven\'t responded' },
];

const ACTION_TYPES = [
  { id: 'slack_alert', label: 'Slack Alert' },
  { id: 'in_app', label: 'In-App Notification' },
  { id: 'agent_followup', label: 'Agent Follow-up' },
];

function useSLARules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sla-rules', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_sla_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SLARule[];
    },
    enabled: !!user,
  });
}

function useCreateSLARule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      rule_type: string;
      conditions: any;
      action_type: string;
      action_config?: any;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data: rule, error } = await supabase
        .from('deal_sla_rules')
        .insert({
          ...data,
          user_id: user.id,
          company_id: company?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return rule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-rules'] });
      toast.success('SLA rule created');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });
}

function useUpdateSLARule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase
        .from('deal_sla_rules')
        .update(data as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-rules'] });
    },
  });
}

function useDeleteSLARule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deal_sla_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-rules'] });
      toast.success('SLA rule deleted');
    },
  });
}

function CreateSLARuleDialog({ onClose }: { onClose: () => void }) {
  const createRule = useCreateSLARule();
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState('stale_deal');
  const [actionType, setActionType] = useState('in_app');
  const [staleDays, setStaleDays] = useState('7');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    createRule.mutate({
      name: name || RULE_TYPES.find(r => r.id === ruleType)?.label || 'SLA Rule',
      description: description || undefined,
      rule_type: ruleType,
      conditions: { stale_days: parseInt(staleDays) || 7 },
      action_type: actionType,
      action_config: {},
    }, { onSuccess: onClose });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rule Type</Label>
        <Select value={ruleType} onValueChange={setRuleType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {RULE_TYPES.map(type => (
              <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {RULE_TYPES.find(r => r.id === ruleType)?.description}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input placeholder="e.g. Flag stale deals after 7 days" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Threshold (days)</Label>
        <Input type="number" min="1" value={staleDays} onChange={e => setStaleDays(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Action</Label>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(type => (
              <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea placeholder="Describe this rule..." value={description} onChange={e => setDescription(e.target.value)} rows={2} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={createRule.isPending}>
          {createRule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create Rule
        </Button>
      </DialogFooter>
    </div>
  );
}

function SLARuleCard({ rule }: { rule: SLARule }) {
  const [expanded, setExpanded] = useState(false);
  const updateRule = useUpdateSLARule();
  const deleteRule = useDeleteSLARule();

  const ruleTypeInfo = RULE_TYPES.find(t => t.id === rule.rule_type);
  const actionInfo = ACTION_TYPES.find(t => t.id === rule.action_type);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="border rounded-lg p-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className={cn('h-4 w-4 shrink-0', rule.is_active ? 'text-yellow-500' : 'text-muted-foreground')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{rule.name}</span>
              <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-[10px] h-4">
                {rule.is_active ? 'Active' : 'Paused'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{ruleTypeInfo?.label}</span>
              <span>·</span>
              <span>{rule.conditions?.stale_days || 7}d threshold</span>
              <span>·</span>
              <span>{actionInfo?.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Switch
              checked={rule.is_active}
              onCheckedChange={(checked) => updateRule.mutate({ id: rule.id, is_active: checked })}
            />
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2">
            {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Created: {format(new Date(rule.created_at), 'MMM d, yyyy')}</p>
              {rule.last_checked_at && <p>Last checked: {format(new Date(rule.last_checked_at), 'MMM d, h:mm a')}</p>}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs" onClick={() => deleteRule.mutate(rule.id)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function SLARulesSettings() {
  const { data: rules, isLoading } = useSLARules();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Deal SLA Rules
            </CardTitle>
            <CardDescription>Automated monitoring for deal activity and response times</CardDescription>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Rule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create SLA Rule</DialogTitle>
              </DialogHeader>
              <CreateSLARuleDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading rules...</div>
        ) : !rules?.length ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No SLA rules configured</p>
            <p className="text-xs text-muted-foreground/70">Create rules to monitor deal activity</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <SLARuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
