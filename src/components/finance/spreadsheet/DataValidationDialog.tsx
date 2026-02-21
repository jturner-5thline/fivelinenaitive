import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck } from 'lucide-react';

export type ValidationType = 'list' | 'number' | 'date' | 'text_length';

export interface DataValidationRule {
  type: ValidationType;
  options?: string[]; // for list type
  min?: number;
  max?: number;
  errorMessage?: string;
}

interface DataValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRule?: DataValidationRule;
  onApply: (rule: DataValidationRule | null) => void;
}

export function DataValidationDialog({ open, onOpenChange, currentRule, onApply }: DataValidationDialogProps) {
  const [type, setType] = useState<ValidationType>(currentRule?.type || 'list');
  const [options, setOptions] = useState(currentRule?.options?.join(', ') || '');
  const [min, setMin] = useState(String(currentRule?.min ?? ''));
  const [max, setMax] = useState(String(currentRule?.max ?? ''));
  const [errorMsg, setErrorMsg] = useState(currentRule?.errorMessage || '');

  const handleApply = () => {
    const rule: DataValidationRule = { type, errorMessage: errorMsg || undefined };
    if (type === 'list') {
      rule.options = options.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      if (min) rule.min = parseFloat(min);
      if (max) rule.max = parseFloat(max);
    }
    onApply(rule);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Data Validation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Validation Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ValidationType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="list">Dropdown List</SelectItem>
                <SelectItem value="number">Number Range</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="text_length">Text Length</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'list' && (
            <div>
              <Label className="text-xs">Options (comma separated)</Label>
              <Textarea
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                className="text-xs min-h-[60px]"
                placeholder="Option 1, Option 2, Option 3"
              />
            </div>
          )}

          {(type === 'number' || type === 'text_length') && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Min</Label>
                <Input value={min} onChange={(e) => setMin(e.target.value)} className="h-8 text-xs" type="number" />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Max</Label>
                <Input value={max} onChange={(e) => setMax(e.target.value)} className="h-8 text-xs" type="number" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Error Message (optional)</Label>
            <Input value={errorMsg} onChange={(e) => setErrorMsg(e.target.value)} className="h-8 text-xs" placeholder="Invalid input" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { onApply(null); onOpenChange(false); }}>
            Remove Validation
          </Button>
          <Button size="sm" className="text-xs" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function validateCellValue(value: string | number | null, rule: DataValidationRule): { valid: boolean; message?: string } {
  if (value === null || value === undefined || value === '') return { valid: true };

  switch (rule.type) {
    case 'list':
      if (rule.options && !rule.options.includes(String(value))) {
        return { valid: false, message: rule.errorMessage || `Value must be one of: ${rule.options.join(', ')}` };
      }
      break;
    case 'number': {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (isNaN(num)) return { valid: false, message: rule.errorMessage || 'Must be a number' };
      if (rule.min !== undefined && num < rule.min) return { valid: false, message: rule.errorMessage || `Must be at least ${rule.min}` };
      if (rule.max !== undefined && num > rule.max) return { valid: false, message: rule.errorMessage || `Must be at most ${rule.max}` };
      break;
    }
    case 'text_length': {
      const len = String(value).length;
      if (rule.min !== undefined && len < rule.min) return { valid: false, message: rule.errorMessage || `Must be at least ${rule.min} characters` };
      if (rule.max !== undefined && len > rule.max) return { valid: false, message: rule.errorMessage || `Must be at most ${rule.max} characters` };
      break;
    }
    case 'date': {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return { valid: false, message: rule.errorMessage || 'Must be a valid date' };
      break;
    }
  }
  return { valid: true };
}
