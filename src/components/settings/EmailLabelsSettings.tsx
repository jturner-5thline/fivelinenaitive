import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tags, Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronRight,
  Zap, Shield, User, Info,
} from 'lucide-react';
import {
  useEmailLabels,
  DEFAULT_LABEL_COLORS,
  LABEL_FIELD_OPTIONS,
  LABEL_OPERATOR_OPTIONS,
  type EmailLabel,
  type EmailLabelRule,
} from '@/hooks/useEmailLabels';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCompany } from '@/hooks/useCompany';

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DEFAULT_LABEL_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'h-6 w-6 rounded-full border-2 transition-all',
            value === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function RuleRow({ rule, onToggle, onDelete }: {
  rule: EmailLabelRule;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const fieldLabel = LABEL_FIELD_OPTIONS.find(f => f.value === rule.field)?.label || rule.field;
  const opLabel = LABEL_OPERATOR_OPTIONS.find(o => o.value === rule.operator)?.label || rule.operator;

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-md border text-xs',
      rule.is_active ? 'bg-card' : 'bg-muted/30 opacity-60'
    )}>
      <Zap className="h-3 w-3 text-primary shrink-0" />
      <span className="text-muted-foreground">IF</span>
      <Badge variant="outline" className="text-[10px] h-5">{fieldLabel}</Badge>
      <span className="text-muted-foreground">{opLabel}</span>
      <Badge variant="secondary" className="text-[10px] h-5 max-w-[120px] truncate">"{rule.value}"</Badge>
      <div className="flex-1" />
      <Switch checked={rule.is_active} onCheckedChange={onToggle} className="scale-75" />
      <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" onClick={onDelete}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function LabelCard({ label, rules, onEdit, onDelete, onCreateRule, onToggleRule, onDeleteRule }: {
  label: EmailLabel;
  rules: EmailLabelRule[];
  onEdit: () => void;
  onDelete: () => void;
  onCreateRule: (rule: { field: string; operator: string; value: string }) => void;
  onToggleRule: (id: string, active: boolean) => void;
  onDeleteRule: (id: string) => void;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [ruleField, setRuleField] = useState('subject');
  const [ruleOp, setRuleOp] = useState('contains');
  const [ruleValue, setRuleValue] = useState('');

  const handleAddRule = () => {
    if (!ruleValue.trim()) return;
    onCreateRule({ field: ruleField, operator: ruleOp, value: ruleValue.trim() });
    setRuleValue('');
    setAddingRule(false);
  };

  return (
    <div className="rounded-lg border p-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{label.name}</span>
              {label.scope === 'team' ? (
                <Tooltip>
                  <TooltipTrigger>
                    <Shield className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Team label — visible to all members</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger>
                    <User className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Personal label — only visible to you</TooltipContent>
                </Tooltip>
              )}
              {label.is_default && (
                <Badge variant="outline" className="text-[9px] h-4 px-1">Default</Badge>
              )}
            </div>
            {label.description && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{label.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Edit2 className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete label "{label.name}"?</AlertDialogTitle>
                <AlertDialogDescription>This will remove the label from all threads. This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Rules section */}
      
        
          <button className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            
            <Zap className="h-3 w-3" />
            {rules.length} rule{rules.length !== 1 ? 's' : ''} · {rules.filter(r => r.is_active).length} active
          </button>
        
        
          {rules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onToggle={() => onToggleRule(rule.id, !rule.is_active)}
              onDelete={() => onDeleteRule(rule.id)}
            />
          ))}

          {addingRule ? (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-md border bg-muted/20">
              <span className="text-[11px] text-muted-foreground font-medium">IF</span>
              <Select value={ruleField} onValueChange={setRuleField}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_FIELD_OPTIONS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ruleOp} onValueChange={setRuleOp}>
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_OPERATOR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={ruleValue}
                onChange={e => setRuleValue(e.target.value)}
                placeholder="value..."
                className="h-7 text-xs flex-1 min-w-[100px]"
                onKeyDown={e => e.key === 'Enter' && handleAddRule()}
              />
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAddRule}>
                <Check className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingRule(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground w-full justify-start"
              onClick={() => setAddingRule(true)}
            >
              <Plus className="h-3 w-3" />
              Add rule
            </Button>
          )}
        
      
    </div>
  );
}

export function EmailLabelsSettings() {
  const { isAdmin } = useCompany();
  const {
    teamLabels, userLabels, isLoading,
    createLabel, updateLabel, deleteLabel,
    createRule, toggleRule, deleteRule,
    getRulesForLabel,
  } = useEmailLabels();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_LABEL_COLORS[0]);
  const [formDesc, setFormDesc] = useState('');
  const [formScope, setFormScope] = useState<'team' | 'user'>('team');
  const [formDefault, setFormDefault] = useState(false);

  const resetForm = () => {
    setFormName(''); setFormColor(DEFAULT_LABEL_COLORS[0]); setFormDesc('');
    setFormScope('team'); setFormDefault(false);
    setEditingId(null); setShowForm(false);
  };

  const startEdit = (label: EmailLabel) => {
    setEditingId(label.id);
    setFormName(label.name);
    setFormColor(label.color);
    setFormDesc(label.description || '');
    setFormScope(label.scope);
    setFormDefault(label.is_default);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    if (editingId) {
      updateLabel.mutate({ id: editingId, name: formName.trim(), color: formColor, description: formDesc.trim() || null, is_default: formDefault });
    } else {
      createLabel.mutate({ name: formName.trim(), color: formColor, description: formDesc.trim() || undefined, scope: formScope, is_default: formDefault });
    }
    resetForm();
  };

  const handleCreateRule = (labelId: string, rule: { field: string; operator: string; value: string }) => {
    createRule.mutate({
      label_id: labelId,
      field: rule.field as any,
      operator: rule.operator as any,
      value: rule.value,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Tags className="h-4 w-4 text-primary" />
              Email Labels
            </CardTitle>
            <CardDescription>
              Define labels and auto-labeling rules for your team's email threads
            </CardDescription>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => { setFormScope(isAdmin ? 'team' : 'user'); setShowForm(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Label
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info callout */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Smart labels</strong> auto-apply to email threads based on rules you define — matching sender domains, subject keywords, or deal metadata.</p>
            <p>Labels show as colored chips on threads with tooltips explaining why they were applied.</p>
          </div>
        </div>

        {/* Create/Edit form */}
        {showForm && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{editingId ? 'Edit Label' : 'New Label'}</Label>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetForm}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Finance" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={formScope} onValueChange={(v: 'team' | 'user') => setFormScope(v)} disabled={!!editingId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isAdmin && <SelectItem value="team">Team label</SelectItem>}
                    <SelectItem value="user">Personal label</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description (shown as tooltip)</Label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Explain when this label applies..." className="mt-1 min-h-[60px]" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Color</Label>
              <ColorPicker value={formColor} onChange={setFormColor} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formDefault} onCheckedChange={setFormDefault} id="default-toggle" />
              <Label htmlFor="default-toggle" className="text-xs">Default label (auto-shown on new threads)</Label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={createLabel.isPending || updateLabel.isPending} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {editingId ? 'Update' : 'Create'} Label
              </Button>
            </div>
          </div>
        )}

        {/* Team labels */}
        {isAdmin && teamLabels.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team Labels</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{teamLabels.length}</Badge>
            </div>
            <div className="space-y-2">
              {teamLabels.map(label => (
                <LabelCard
                  key={label.id}
                  label={label}
                  rules={getRulesForLabel(label.id)}
                  onEdit={() => startEdit(label)}
                  onDelete={() => deleteLabel.mutate(label.id)}
                  onCreateRule={(rule) => handleCreateRule(label.id, rule)}
                  onToggleRule={(id, active) => toggleRule.mutate({ id, is_active: active })}
                  onDeleteRule={(id) => deleteRule.mutate(id)}
                />
              ))}
            </div>
          </div>
        )}

        {teamLabels.length > 0 && userLabels.length > 0 && <Separator />}

        {/* User labels */}
        {userLabels.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">My Labels</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{userLabels.length}</Badge>
            </div>
            <div className="space-y-2">
              {userLabels.map(label => (
                <LabelCard
                  key={label.id}
                  label={label}
                  rules={getRulesForLabel(label.id)}
                  onEdit={() => startEdit(label)}
                  onDelete={() => deleteLabel.mutate(label.id)}
                  onCreateRule={(rule) => handleCreateRule(label.id, rule)}
                  onToggleRule={(id, active) => toggleRule.mutate({ id, is_active: active })}
                  onDeleteRule={(id) => deleteRule.mutate(id)}
                />
              ))}
            </div>
          </div>
        )}

        {isLoading && <div className="text-center py-8 text-sm text-muted-foreground">Loading labels…</div>}
        {!isLoading && teamLabels.length === 0 && userLabels.length === 0 && !showForm && (
          <div className="text-center py-8">
            <Tags className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No email labels configured</p>
            <p className="text-xs text-muted-foreground mt-1">Create labels to organize and auto-categorize email threads</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
