import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Video, Settings2, Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  RefreshCw, ExternalLink, AlertCircle, CheckCircle, Clock, XCircle,
  ArrowLeft, Eye, Filter, RotateCcw
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { useAdminRole } from '@/hooks/useAdminRole';
import {
  useClaapConfig, useClaapRoutingRules, useClaapExcludedMeetings,
  ClaapRoutingRule
} from '@/hooks/useClaapMeetings';
import { cn } from '@/lib/utils';

// ============================================
// Condition/Action option types
// ============================================
const CONDITION_TYPES = [
  { value: 'title_contains', label: 'Title contains' },
  { value: 'title_not_contains', label: 'Title does not contain' },
  { value: 'participant_domain_is', label: 'Participant domain is' },
  { value: 'participant_domain_is_not', label: 'Participant domain is not' },
  { value: 'duration_gt', label: 'Duration greater than (min)' },
  { value: 'duration_lt', label: 'Duration less than (min)' },
  { value: 'participant_count_gt', label: 'Participant count greater than' },
  { value: 'participant_count_lt', label: 'Participant count less than' },
  { value: 'has_external', label: 'Has external participant' },
];

const ACTION_TYPES = [
  { value: 'route_to_deal', label: 'Route to Deal' },
  { value: 'route_to_contact', label: 'Route to Contact' },
  { value: 'route_to_company', label: 'Route to Company' },
  { value: 'trigger_deal_creation', label: 'Trigger Deal creation prompt' },
  { value: 'trigger_contact_confirmation', label: 'Trigger Contact confirmation' },
  { value: 'trigger_company_confirmation', label: 'Trigger Company confirmation' },
  { value: 'exclude', label: 'Exclude from routing' },
  { value: 'tag', label: 'Tag meeting with' },
];

// ============================================
// Config Panel
// ============================================
function ConfigPanel() {
  const { config, isLoading, upsertConfig } = useClaapConfig();
  const [domains, setDomains] = useState('');
  const [patterns, setPatterns] = useState('');
  const [minDuration, setMinDuration] = useState('5');
  const [taskExpiry, setTaskExpiry] = useState('7');
  const [initialized, setInitialized] = useState(false);

  if (!initialized && config) {
    setDomains(config.internal_domains?.join(', ') || '');
    setPatterns(config.excluded_title_patterns?.join('\n') || '');
    setMinDuration(String((config.min_duration_seconds || 300) / 60));
    setTaskExpiry(String(config.task_expiry_days || 7));
    setInitialized(true);
  }

  const handleSave = () => {
    upsertConfig.mutate({
      internal_domains: domains.split(',').map(d => d.trim()).filter(Boolean),
      excluded_title_patterns: patterns.split('\n').map(p => p.trim()).filter(Boolean),
      min_duration_seconds: Math.max(0, Number(minDuration) * 60),
      task_expiry_days: Math.max(1, Number(taskExpiry)),
      is_active: true,
    });
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Internal Domains</Label>
        <Input
          value={domains}
          onChange={e => setDomains(e.target.value)}
          placeholder="5thlinefinancing.com, 5thline.co"
        />
        <p className="text-xs text-muted-foreground">Comma-separated. Participants with these domains are treated as internal.</p>
      </div>

      <div className="space-y-2">
        <Label>Minimum Meeting Duration (minutes)</Label>
        <Input
          type="number"
          value={minDuration}
          onChange={e => setMinDuration(e.target.value)}
          min={0}
        />
        <p className="text-xs text-muted-foreground">Meetings shorter than this are auto-excluded.</p>
      </div>

      <div className="space-y-2">
        <Label>Excluded Title Patterns</Label>
        <textarea
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={patterns}
          onChange={e => setPatterns(e.target.value)}
          placeholder={"5th Line Weekly\nPartners Meeting\nAll Hands"}
        />
        <p className="text-xs text-muted-foreground">One per line. Meetings with titles containing these patterns are auto-excluded.</p>
      </div>

      <div className="space-y-2">
        <Label>Task Expiry (days)</Label>
        <Input
          type="number"
          value={taskExpiry}
          onChange={e => setTaskExpiry(e.target.value)}
          min={1}
        />
        <p className="text-xs text-muted-foreground">Confirmation tasks expire after this many days.</p>
      </div>

      <Button onClick={handleSave} disabled={upsertConfig.isPending}>
        {upsertConfig.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save Configuration
      </Button>
    </div>
  );
}

// ============================================
// Rule Builder
// ============================================
function RuleBuilder() {
  const { rules, isLoading, createRule, updateRule, deleteRule, reorderRules } = useClaapRoutingRules();
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', conditions: [] as any[], actions: [] as any[], condition_logic: 'AND' });

  const handleAddCondition = () => {
    setNewRule(prev => ({
      ...prev,
      conditions: [...prev.conditions, { type: 'title_contains', value: '' }],
    }));
  };

  const handleAddAction = () => {
    setNewRule(prev => ({
      ...prev,
      actions: [...prev.actions, { type: 'route_to_deal', value: '' }],
    }));
  };

  const handleCreateRule = () => {
    if (!newRule.name.trim()) { toast.error('Rule name is required'); return; }
    createRule.mutate({
      name: newRule.name,
      conditions: newRule.conditions,
      actions: newRule.actions,
      condition_logic: newRule.condition_logic,
      position: rules.length,
    });
    setShowAddRule(false);
    setNewRule({ name: '', conditions: [], actions: [], condition_logic: 'AND' });
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Rules are evaluated top-down. First matching rule wins.</p>
        </div>
        <Button size="sm" onClick={() => setShowAddRule(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Rule
        </Button>
      </div>

      {rules.length === 0 && (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium">No routing rules configured</p>
          <p className="text-sm text-muted-foreground mt-1">The default routing engine will be used. Add rules to customize behavior.</p>
        </div>
      )}

      {rules.map((rule, index) => (
        <Card key={rule.id} className="relative">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">#{index + 1}</span>
                  <span className="font-medium text-sm truncate">{rule.name}</span>
                  {!rule.is_active && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {(rule.conditions as any[])?.map((c: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {CONDITION_TYPES.find(t => t.value === c.type)?.label || c.type}: {String(c.value)}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground mx-1">→</span>
                  {(rule.actions as any[])?.map((a: any, i: number) => (
                    <Badge key={i} variant="default" className="text-xs">
                      {ACTION_TYPES.find(t => t.value === a.type)?.label || a.type}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(checked) => updateRule.mutate({ id: rule.id, is_active: checked })}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRule.mutate(rule.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add Rule Dialog */}
      <Dialog open={showAddRule} onOpenChange={setShowAddRule}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Routing Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input value={newRule.name} onChange={e => setNewRule(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Route financing reviews" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <div className="flex items-center gap-2">
                  <Select value={newRule.condition_logic} onValueChange={v => setNewRule(prev => ({ ...prev, condition_logic: v }))}>
                    <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddCondition}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>
              {newRule.conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={cond.type} onValueChange={v => {
                    const updated = [...newRule.conditions];
                    updated[i] = { ...updated[i], type: v };
                    setNewRule(prev => ({ ...prev, conditions: updated }));
                  }}>
                    <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {cond.type !== 'has_external' ? (
                    <Input
                      className="h-8 text-xs"
                      value={cond.value}
                      onChange={e => {
                        const updated = [...newRule.conditions];
                        updated[i] = { ...updated[i], value: e.target.value };
                        setNewRule(prev => ({ ...prev, conditions: updated }));
                      }}
                      placeholder="Value"
                    />
                  ) : (
                    <Select value={cond.value || 'yes'} onValueChange={v => {
                      const updated = [...newRule.conditions];
                      updated[i] = { ...updated[i], value: v };
                      setNewRule(prev => ({ ...prev, conditions: updated }));
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                    setNewRule(prev => ({ ...prev, conditions: prev.conditions.filter((_, j) => j !== i) }));
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Actions</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddAction}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {newRule.actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={action.type} onValueChange={v => {
                    const updated = [...newRule.actions];
                    updated[i] = { ...updated[i], type: v };
                    setNewRule(prev => ({ ...prev, actions: updated }));
                  }}>
                    <SelectTrigger className="h-8 text-xs w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {action.type === 'tag' && (
                    <Input
                      className="h-8 text-xs"
                      value={action.value || ''}
                      onChange={e => {
                        const updated = [...newRule.actions];
                        updated[i] = { ...updated[i], value: e.target.value };
                        setNewRule(prev => ({ ...prev, actions: updated }));
                      }}
                      placeholder="Tag name"
                    />
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                    setNewRule(prev => ({ ...prev, actions: prev.actions.filter((_, j) => j !== i) }));
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRule(false)}>Cancel</Button>
            <Button onClick={handleCreateRule} disabled={createRule.isPending}>Create Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Excluded Meetings Log
// ============================================
function ExcludedMeetingsLog() {
  const { meetings, isLoading, reroute } = useClaapExcludedMeetings();

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (meetings.length === 0) {
    return (
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="font-medium">No excluded meetings</p>
        <p className="text-sm text-muted-foreground mt-1">All meetings have been routed successfully.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meetings.map(meeting => (
          <TableRow key={meeting.id}>
            <TableCell className="font-medium text-sm max-w-[200px] truncate">{meeting.title || 'Untitled'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {meeting.started_at ? format(new Date(meeting.started_at), 'MMM d, yyyy') : '—'}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">{meeting.exclusion_reason || 'Unknown'}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {meeting.duration_seconds ? `${Math.floor(meeting.duration_seconds / 60)}m` : '—'}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => reroute.mutate(meeting.id)}
                disabled={reroute.isPending}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Re-route
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================
// Main Settings Page Component
// ============================================
export function ClaapSettingsPage() {
  const { isAdmin, isLoading: roleLoading } = useAdminRole();

  if (roleLoading) {
    return <div className="space-y-3 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">Access Denied</p>
        <p className="text-sm text-muted-foreground mt-1">Only administrators can access Claap routing settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <Video className="h-5 w-5 text-purple-500" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Claap Meeting Router</h2>
          <p className="text-sm text-muted-foreground">Configure how Claap meetings are routed to deals, contacts, and companies</p>
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">
            <Settings2 className="h-4 w-4 mr-1" /> Configuration
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Filter className="h-4 w-4 mr-1" /> Routing Rules
          </TabsTrigger>
          <TabsTrigger value="excluded">
            <XCircle className="h-4 w-4 mr-1" /> Excluded Meetings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection & Filters</CardTitle>
              <CardDescription>Configure internal domains, exclusion patterns, and thresholds</CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Routing Rules</CardTitle>
              <CardDescription>Define custom rules for how meetings are routed. Rules are evaluated top-down.</CardDescription>
            </CardHeader>
            <CardContent>
              <RuleBuilder />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excluded" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Excluded Meetings</CardTitle>
              <CardDescription>Meetings that were excluded from routing. You can re-route them manually.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExcludedMeetingsLog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
