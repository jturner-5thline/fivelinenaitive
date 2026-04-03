import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette } from 'lucide-react';

export type ConditionType = 'greater_than' | 'less_than' | 'equal_to' | 'not_empty' | 'contains' | 'between';

export interface ConditionalFormatRule {
  id: string;
  condition: ConditionType;
  value1: string;
  value2?: string;
  bgColor: string;
  fontColor: string;
}

interface ConditionalFormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: ConditionalFormatRule[];
  onAddRule: (rule: ConditionalFormatRule) => void;
  onDeleteRule: (id: string) => void;
}

const CONDITION_LABELS: Record<ConditionType, string> = {
  greater_than: 'Greater than',
  less_than: 'Less than',
  equal_to: 'Equal to',
  not_empty: 'Is not empty',
  contains: 'Text contains',
  between: 'Between',
};

const PRESET_COLORS = [
  { bg: '#dcfce7', font: '#166534', label: 'Green' },
  { bg: '#fef9c3', font: '#854d0e', label: 'Yellow' },
  { bg: '#fee2e2', font: '#991b1b', label: 'Red' },
  { bg: '#dbeafe', font: '#1e40af', label: 'Blue' },
  { bg: '#f3e8ff', font: '#6b21a8', label: 'Purple' },
];

export function ConditionalFormatDialog({ open, onOpenChange, rules, onAddRule, onDeleteRule }: ConditionalFormatDialogProps) {
  const [condition, setCondition] = useState<ConditionType>('greater_than');
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const safeRules = rules || [];

  const handleAdd = () => {
    const preset = PRESET_COLORS[selectedPreset];
    onAddRule({
      id: crypto.randomUUID(),
      condition,
      value1,
      value2: condition === 'between' ? value2 : undefined,
      bgColor: preset.bg,
      fontColor: preset.font,
    });
    setValue1('');
    setValue2('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4" /> Conditional Formatting
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing rules */}
          {safeRules.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Active Rules</Label>
              {safeRules.map(rule => (
                <div key={rule.id} className="flex items-center gap-2 text-xs border rounded px-2 py-1.5">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: rule.bgColor, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <span className="flex-1">{CONDITION_LABELS[rule.condition]} {rule.value1}{rule.value2 ? ` and ${rule.value2}` : ''}</span>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] text-destructive" onClick={() => onDeleteRule(rule.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* New rule */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as ConditionType)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONDITION_LABELS || {}).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {condition !== 'not_empty' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Value</Label>
                  <Input value={value1} onChange={(e) => setValue1(e.target.value)} className="h-8 text-xs" placeholder="e.g. 100" />
                </div>
                {condition === 'between' && (
                  <div className="flex-1">
                    <Label className="text-xs">And</Label>
                    <Input value={value2} onChange={(e) => setValue2(e.target.value)} className="h-8 text-xs" placeholder="e.g. 500" />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Format Style</Label>
              <div className="flex gap-2 mt-1">
                {PRESET_COLORS.map((p, i) => (
                  <button
                    key={i}
                    className={`w-8 h-8 rounded border-2 text-[10px] font-bold ${selectedPreset === i ? 'border-primary' : 'border-transparent'}`}
                    style={{ backgroundColor: p.bg, color: p.font }}
                    onClick={() => setSelectedPreset(i)}
                  >
                    Ab
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" className="text-xs" onClick={handleAdd} disabled={condition !== 'not_empty' && !value1}>
            Add Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Utility: evaluate conditional format rules against a cell value
export function evaluateConditionalFormat(
  value: string | number | null,
  rules: ConditionalFormatRule[]
): { bgColor?: string; fontColor?: string } | null {
  if (value === null || value === undefined) {
    const notEmptyRule = rules.find(r => r.condition === 'not_empty');
    return notEmptyRule ? null : null; // not_empty won't match null
  }

  for (const rule of rules) {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value));
    const numCond = parseFloat(rule.value1);
    const str = String(value);

    switch (rule.condition) {
      case 'greater_than':
        if (!isNaN(numVal) && !isNaN(numCond) && numVal > numCond) return { bgColor: rule.bgColor, fontColor: rule.fontColor };
        break;
      case 'less_than':
        if (!isNaN(numVal) && !isNaN(numCond) && numVal < numCond) return { bgColor: rule.bgColor, fontColor: rule.fontColor };
        break;
      case 'equal_to':
        if (str === rule.value1 || (!isNaN(numVal) && numVal === numCond)) return { bgColor: rule.bgColor, fontColor: rule.fontColor };
        break;
      case 'not_empty':
        if (str.trim() !== '') return { bgColor: rule.bgColor, fontColor: rule.fontColor };
        break;
      case 'contains':
        if (str.toLowerCase().includes(rule.value1.toLowerCase())) return { bgColor: rule.bgColor, fontColor: rule.fontColor };
        break;
      case 'between': {
        const numCond2 = parseFloat(rule.value2 || '');
        if (!isNaN(numVal) && !isNaN(numCond) && !isNaN(numCond2) && numVal >= numCond && numVal <= numCond2)
          return { bgColor: rule.bgColor, fontColor: rule.fontColor };
        break;
      }
    }
  }
  return null;
}
