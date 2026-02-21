import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, BarChart3, Palette } from 'lucide-react';
import { ConditionalFormatRule } from '@/hooks/useSpreadsheetWorkbook';

interface ConditionalFormatRulesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: ConditionalFormatRule[];
  onAddRule: (rule: ConditionalFormatRule) => void;
  onDeleteRule: (id: string) => void;
}

type RuleType = 'color_scale' | 'data_bar' | 'icon_set' | 'standard';

const COLOR_SCALE_PRESETS = [
  { name: 'Green-Yellow-Red', colors: ['#63be7b', '#ffeb84', '#f8696b'] },
  { name: 'Blue-White-Red', colors: ['#5a8ac6', '#fcfcff', '#f8696b'] },
  { name: 'Green-White', colors: ['#63be7b', '#ffffff', '#ffffff'] },
];

const ICON_SET_PRESETS = [
  { name: 'Arrows', icons: ['↑', '→', '↓'] },
  { name: 'Traffic Lights', icons: ['🟢', '🟡', '🔴'] },
  { name: 'Stars', icons: ['★★★', '★★', '★'] },
  { name: 'Flags', icons: ['🟩', '🟨', '🟥'] },
];

export function ConditionalFormatRulesPanel({ open, onOpenChange, rules, onAddRule, onDeleteRule }: ConditionalFormatRulesPanelProps) {
  const [ruleType, setRuleType] = useState<RuleType>('standard');
  const [condition, setCondition] = useState<ConditionalFormatRule['condition']>('greater_than');
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');
  const [bgColor, setBgColor] = useState('#63be7b');
  const [fontColor, setFontColor] = useState('#000000');
  const [selectedPreset, setSelectedPreset] = useState(0);

  const handleAdd = () => {
    if (ruleType === 'standard') {
      onAddRule({
        id: crypto.randomUUID(),
        condition,
        value1,
        value2: condition === 'between' ? value2 : undefined,
        bgColor,
        fontColor,
      });
    } else if (ruleType === 'color_scale') {
      const preset = COLOR_SCALE_PRESETS[selectedPreset];
      // Create 3 rules for color scale simulation
      onAddRule({ id: crypto.randomUUID(), condition: 'greater_than', value1: '66', bgColor: preset.colors[0], fontColor: '#000000' });
      onAddRule({ id: crypto.randomUUID(), condition: 'between', value1: '33', value2: '66', bgColor: preset.colors[1], fontColor: '#000000' });
      onAddRule({ id: crypto.randomUUID(), condition: 'less_than', value1: '33', bgColor: preset.colors[2], fontColor: '#000000' });
    }
    setValue1('');
    setValue2('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" /> Conditional Formatting
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule type selector */}
          <div className="grid grid-cols-4 gap-1">
            {(['standard', 'color_scale', 'data_bar', 'icon_set'] as RuleType[]).map(type => (
              <Button
                key={type}
                variant={ruleType === type ? 'default' : 'outline'}
                size="sm"
                className="text-[10px] h-7"
                onClick={() => setRuleType(type)}
              >
                {type === 'standard' ? 'Rules' : type === 'color_scale' ? 'Color Scale' : type === 'data_bar' ? 'Data Bars' : 'Icon Sets'}
              </Button>
            ))}
          </div>

          {ruleType === 'standard' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Condition</Label>
                  <Select value={condition} onValueChange={(v) => setCondition(v as any)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greater_than">Greater than</SelectItem>
                      <SelectItem value="less_than">Less than</SelectItem>
                      <SelectItem value="equal_to">Equal to</SelectItem>
                      <SelectItem value="not_empty">Not empty</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="between">Between</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Value</Label>
                  <Input className="h-8 text-xs" value={value1} onChange={(e) => setValue1(e.target.value)} placeholder="Value..." />
                </div>
              </div>
              {condition === 'between' && (
                <div>
                  <Label className="text-xs">And</Label>
                  <Input className="h-8 text-xs" value={value2} onChange={(e) => setValue2(e.target.value)} placeholder="Upper value..." />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Background</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer" />
                    <span className="text-xs text-muted-foreground">{bgColor}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Font Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer" />
                    <span className="text-xs text-muted-foreground">{fontColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {ruleType === 'color_scale' && (
            <div className="space-y-2">
              <Label className="text-xs">Preset</Label>
              {COLOR_SCALE_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  className={`w-full p-2 rounded border text-xs flex items-center gap-2 ${selectedPreset === i ? 'border-primary bg-accent' : 'border-border'}`}
                  onClick={() => setSelectedPreset(i)}
                >
                  <div className="flex h-4 flex-1 rounded overflow-hidden">
                    {preset.colors.map((c, ci) => (
                      <div key={ci} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          )}

          {ruleType === 'data_bar' && (
            <div className="p-4 text-center text-xs text-muted-foreground border rounded-md bg-muted/20">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              Data bars render proportional bars inside cells based on numeric values. Apply to see bars proportional to cell values in the selected range.
            </div>
          )}

          {ruleType === 'icon_set' && (
            <div className="space-y-2">
              <Label className="text-xs">Icon Set</Label>
              {ICON_SET_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  className={`w-full p-2 rounded border text-xs flex items-center gap-3 ${selectedPreset === i ? 'border-primary bg-accent' : 'border-border'}`}
                  onClick={() => setSelectedPreset(i)}
                >
                  <div className="flex gap-2 text-sm">
                    {preset.icons.map((icon, ii) => <span key={ii}>{icon}</span>)}
                  </div>
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          )}

          <Button size="sm" className="w-full text-xs" onClick={handleAdd}>
            <Plus className="h-3 w-3 mr-1" /> Add Rule
          </Button>

          {/* Existing rules */}
          {rules.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Active Rules ({rules.length})</Label>
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-2 p-2 rounded border text-xs">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: rule.bgColor, border: '1px solid hsl(var(--border))' }} />
                  <span className="flex-1">{rule.condition.replace(/_/g, ' ')} {rule.value1}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDeleteRule(rule.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
