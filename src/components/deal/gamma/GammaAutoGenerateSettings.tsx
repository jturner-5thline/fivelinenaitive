import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { GAMMA_TEMPLATES } from './GammaTemplateLibrary';
import { toast } from 'sonner';

interface AutoGenRule {
  id: string;
  stage: string;
  templateId: string;
  format: 'presentation' | 'document';
  enabled: boolean;
}

const COMMON_STAGES = [
  'Marketing',
  'Term Sheet',
  'Due Diligence',
  'Credit Committee',
  'Documentation',
  'Closing',
  'Funded',
];

interface GammaAutoGenerateSettingsProps {
  rules: AutoGenRule[];
  onRulesChange: (rules: AutoGenRule[]) => void;
}

export function GammaAutoGenerateSettings({ rules, onRulesChange }: GammaAutoGenerateSettingsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({ stage: '', templateId: '', format: 'presentation' as 'presentation' | 'document' });

  const handleAdd = () => {
    if (!newRule.stage || !newRule.templateId) {
      toast.error('Select a stage and template');
      return;
    }
    const rule: AutoGenRule = {
      id: crypto.randomUUID(),
      stage: newRule.stage,
      templateId: newRule.templateId,
      format: newRule.format,
      enabled: true,
    };
    onRulesChange([...rules, rule]);
    setNewRule({ stage: '', templateId: '', format: 'presentation' });
    setDialogOpen(false);
    toast.success('Auto-generate rule added');
  };

  const toggleRule = (id: string) => {
    onRulesChange(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    onRulesChange(rules.filter(r => r.id !== id));
    toast.success('Rule removed');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto-Generate Rules</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
              <Plus className="h-3 w-3" /> Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Auto-Generate Rule</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Automatically generate a Gamma presentation when a deal reaches a specific stage.
            </p>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">When deal reaches stage</Label>
                <Select value={newRule.stage} onValueChange={(v) => setNewRule(r => ({ ...r, stage: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_STAGES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Generate template</Label>
                <Select value={newRule.templateId} onValueChange={(v) => setNewRule(r => ({ ...r, templateId: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {GAMMA_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Format</Label>
                <Select value={newRule.format} onValueChange={(v: 'presentation' | 'document') => setNewRule(r => ({ ...r, format: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presentation">Presentation</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} className="w-full">Add Rule</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
          No auto-generate rules configured yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {rules.map(rule => {
            const template = GAMMA_TEMPLATES.find(t => t.id === rule.templateId);
            return (
              <div key={rule.id} className="flex items-center justify-between py-2 px-3 rounded-lg border bg-card group">
                <div className="flex items-center gap-3">
                  <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{rule.stage}</Badge>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-xs font-medium text-foreground">{template?.label || rule.templateId}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground capitalize">{rule.format}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={() => deleteRule(rule.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
