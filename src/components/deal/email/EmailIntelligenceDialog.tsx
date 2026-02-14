import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tags,
  Brain,
  Bell,
  Sparkles,
  Plus,
  X,
  TrendingUp,
  AlertTriangle,
  FileText,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EmailIntelligenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TagRule {
  id: string;
  label: string;
  keywords: string[];
  color: string;
}

const defaultTagRules: TagRule[] = [
  { id: '1', label: 'Term Sheet', keywords: ['term sheet', 'terms', 'offer letter'], color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { id: '2', label: 'Due Diligence', keywords: ['due diligence', 'diligence', 'DD'], color: 'bg-primary/10 text-primary border-primary/20' },
  { id: '3', label: 'Urgent', keywords: ['urgent', 'asap', 'immediately', 'deadline'], color: 'bg-destructive/10 text-destructive border-destructive/20' },
  { id: '4', label: 'Financial', keywords: ['financial', 'revenue', 'EBITDA', 'P&L', 'balance sheet'], color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
];

export function EmailIntelligenceDialog({ open, onOpenChange }: EmailIntelligenceDialogProps) {
  const [tagRules, setTagRules] = useState<TagRule[]>(defaultTagRules);
  const [newKeyword, setNewKeyword] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newRuleLabel, setNewRuleLabel] = useState('');

  // Intelligence toggles
  const [autoTagging, setAutoTagging] = useState(true);
  const [sentimentAnalysis, setSentimentAnalysis] = useState(true);
  const [signalDetection, setSignalDetection] = useState(true);
  const [followUpReminders, setFollowUpReminders] = useState(true);
  const [threadSummaries, setThreadSummaries] = useState(false);
  const [autoExtract, setAutoExtract] = useState(false);

  const addKeywordToRule = (ruleId: string) => {
    if (!newKeyword.trim()) return;
    setTagRules(prev =>
      prev.map(r =>
        r.id === ruleId
          ? { ...r, keywords: [...r.keywords, newKeyword.trim()] }
          : r
      )
    );
    setNewKeyword('');
  };

  const removeKeywordFromRule = (ruleId: string, keyword: string) => {
    setTagRules(prev =>
      prev.map(r =>
        r.id === ruleId
          ? { ...r, keywords: r.keywords.filter(k => k !== keyword) }
          : r
      )
    );
  };

  const addNewRule = () => {
    if (!newRuleLabel.trim()) return;
    const newRule: TagRule = {
      id: Date.now().toString(),
      label: newRuleLabel.trim(),
      keywords: [],
      color: 'bg-muted text-muted-foreground border-border',
    };
    setTagRules(prev => [...prev, newRule]);
    setNewRuleLabel('');
    setEditingRuleId(newRule.id);
  };

  const removeRule = (ruleId: string) => {
    setTagRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleSave = () => {
    toast.success('Email intelligence settings saved');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4.5 w-4.5 text-primary" />
            Email Intelligence Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure auto-tagging rules, signal detection, and AI-powered email features.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5 pb-5">
          <div className="space-y-5 pt-3">
            {/* ─── AI Features Toggle ─── */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI Features</h4>
              <div className="space-y-3">
                <ToggleRow
                  icon={Tags}
                  label="Auto-Tagging"
                  description="Automatically tag emails based on keyword rules"
                  checked={autoTagging}
                  onCheckedChange={setAutoTagging}
                />
                <ToggleRow
                  icon={TrendingUp}
                  label="Sentiment Analysis"
                  description="Detect positive, neutral, or attention-needed tone"
                  checked={sentimentAnalysis}
                  onCheckedChange={setSentimentAnalysis}
                />
                <ToggleRow
                  icon={AlertTriangle}
                  label="Signal Detection"
                  description="Detect stage changes, risks, and opportunities"
                  checked={signalDetection}
                  onCheckedChange={setSignalDetection}
                />
                <ToggleRow
                  icon={Clock}
                  label="Follow-up Reminders"
                  description="Alert when threads need a follow-up response"
                  checked={followUpReminders}
                  onCheckedChange={setFollowUpReminders}
                />
                <ToggleRow
                  icon={FileText}
                  label="Auto Thread Summaries"
                  description="Generate TL;DR summaries for new threads"
                  checked={threadSummaries}
                  onCheckedChange={setThreadSummaries}
                />
                <ToggleRow
                  icon={Sparkles}
                  label="Auto-Extract Data"
                  description="Automatically extract rates, amounts, and terms"
                  checked={autoExtract}
                  onCheckedChange={setAutoExtract}
                />
              </div>
            </div>

            <Separator />

            {/* ─── Tag Grouping Rules ─── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tag Grouping Rules</h4>
              </div>
              <div className="space-y-3">
                {tagRules.map(rule => (
                  <div key={rule.id} className="rounded-lg border bg-card/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={cn('text-[11px] h-5', rule.color)}>
                        {rule.label}
                      </Badge>
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="p-0.5 rounded hover:bg-muted transition-colors"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {rule.keywords.map(kw => (
                        <Badge
                          key={kw}
                          variant="secondary"
                          className="text-[10px] h-5 gap-1 pr-1"
                        >
                          {kw}
                          <button
                            onClick={() => removeKeywordFromRule(rule.id, kw)}
                            className="ml-0.5 hover:text-destructive transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="Add keyword..."
                        className="h-7 text-xs flex-1"
                        value={editingRuleId === rule.id ? newKeyword : ''}
                        onFocus={() => setEditingRuleId(rule.id)}
                        onChange={(e) => {
                          setEditingRuleId(rule.id);
                          setNewKeyword(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addKeywordToRule(rule.id);
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-2"
                        onClick={() => addKeywordToRule(rule.id)}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Add new rule */}
                <div className="flex gap-1.5">
                  <Input
                    placeholder="New tag name..."
                    className="h-8 text-xs flex-1"
                    value={newRuleLabel}
                    onChange={(e) => setNewRuleLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addNewRule();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={addNewRule}
                    disabled={!newRuleLabel.trim()}
                  >
                    <Plus className="h-3 w-3" />
                    Add Rule
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Toggle Row ───
function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  icon: any;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  );
}
