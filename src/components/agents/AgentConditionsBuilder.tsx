import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Filter } from 'lucide-react';

export interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic?: 'AND' | 'OR';
}

interface AgentConditionsBuilderProps {
  conditions: Condition[];
  onChange: (conditions: Condition[]) => void;
  triggerType: string;
}

const FIELD_OPTIONS: Record<string, Array<{ value: string; label: string; type: string }>> = {
  deal: [
    { value: 'value', label: 'Deal Value', type: 'number' },
    { value: 'stage', label: 'Deal Stage', type: 'select' },
    { value: 'status', label: 'Deal Status', type: 'select' },
    { value: 'deal_type', label: 'Deal Type', type: 'select' },
    { value: 'company', label: 'Company Name', type: 'text' },
  ],
  lender: [
    { value: 'stage', label: 'Lender Stage', type: 'select' },
    { value: 'name', label: 'Lender Name', type: 'text' },
    { value: 'quote_amount', label: 'Quote Amount', type: 'number' },
    { value: 'quote_rate', label: 'Quote Rate', type: 'number' },
  ],
  milestone: [
    { value: 'title', label: 'Milestone Title', type: 'text' },
    { value: 'completed', label: 'Completed', type: 'boolean' },
  ],
};

const OPERATORS: Record<string, Array<{ value: string; label: string }>> = {
  number: [
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'gt', label: 'greater than' },
    { value: 'gte', label: 'greater than or equal' },
    { value: 'lt', label: 'less than' },
    { value: 'lte', label: 'less than or equal' },
  ],
  text: [
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
  ],
  select: [
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'in', label: 'is one of' },
  ],
  boolean: [
    { value: 'eq', label: 'is' },
  ],
};

const STAGE_OPTIONS = ['Lead', 'Proposal', 'Negotiation', 'Due Diligence', 'Closing', 'Closed'];
const STATUS_OPTIONS = ['active', 'won', 'lost', 'closed', 'on_hold'];
const DEAL_TYPE_OPTIONS = ['ABL', 'Term Loan', 'Revolver', 'Equipment', 'Real Estate', 'Mezzanine'];
const LENDER_STAGE_OPTIONS = ['Identified', 'Contacted', 'Meeting', 'Term Sheet', 'Due Diligence', 'Closed', 'Passed'];

function getFieldsForTrigger(triggerType: string) {
  if (triggerType.includes('deal')) return FIELD_OPTIONS.deal;
  if (triggerType.includes('lender')) return [...FIELD_OPTIONS.deal, ...FIELD_OPTIONS.lender];
  if (triggerType.includes('milestone')) return [...FIELD_OPTIONS.deal, ...FIELD_OPTIONS.milestone];
  return FIELD_OPTIONS.deal;
}

export function AgentConditionsBuilder({ conditions, onChange, triggerType }: AgentConditionsBuilderProps) {
  const fields = getFieldsForTrigger(triggerType);

  const addCondition = () => {
    const newCondition: Condition = {
      id: crypto.randomUUID(),
      field: fields[0]?.value || 'value',
      operator: 'eq',
      value: '',
      logic: conditions.length > 0 ? 'AND' : undefined,
    };
    onChange([...conditions, newCondition]);
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    onChange(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const removeCondition = (id: string) => {
    const updated = conditions.filter((c) => c.id !== id);
    // Remove logic from first condition
    if (updated.length > 0 && updated[0].logic) {
      updated[0] = { ...updated[0], logic: undefined };
    }
    onChange(updated);
  };

  const getFieldType = (fieldValue: string) => {
    const field = fields.find((f) => f.value === fieldValue);
    return field?.type || 'text';
  };

  const getValueOptions = (fieldValue: string) => {
    switch (fieldValue) {
      case 'stage':
        return triggerType.includes('lender') ? LENDER_STAGE_OPTIONS : STAGE_OPTIONS;
      case 'status':
        return STATUS_OPTIONS;
      case 'deal_type':
        return DEAL_TYPE_OPTIONS;
      case 'completed':
        return ['true', 'false'];
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Conditions (Optional)</span>
        </div>
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-4 w-4 mr-1" />
          Add Condition
        </Button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No conditions set. This trigger will run for all matching events.
        </p>
      ) : (
        <div className="space-y-3">
          {conditions.map((condition, index) => {
            const fieldType = getFieldType(condition.field);
            const operators = OPERATORS[fieldType] || OPERATORS.text;
            const valueOptions = getValueOptions(condition.field);

            return (
              <Card key={condition.id} className="p-3">
                <div className="space-y-3">
                  {/* Logic operator for conditions after the first */}
                  {index > 0 && (
                    <div className="flex justify-center">
                      <Select
                        value={condition.logic}
                        onValueChange={(v) => updateCondition(condition.id, { logic: v as 'AND' | 'OR' })}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {/* Field */}
                    <Select
                      value={condition.field}
                      onValueChange={(v) => updateCondition(condition.id, { field: v, operator: 'eq', value: '' })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator */}
                    <Select
                      value={condition.operator}
                      onValueChange={(v) => updateCondition(condition.id, { operator: v })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value */}
                    {valueOptions ? (
                      <Select
                        value={condition.value}
                        onValueChange={(v) => updateCondition(condition.id, { value: v })}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select value" />
                        </SelectTrigger>
                        <SelectContent>
                          {valueOptions.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={fieldType === 'number' ? 'number' : 'text'}
                        value={condition.value}
                        onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                        placeholder="Enter value"
                        className="flex-1"
                      />
                    )}

                    {/* Remove */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(condition.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {conditions.length > 0 && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">Condition Summary:</p>
          <div className="flex flex-wrap gap-1">
            {conditions.map((c, i) => (
              <span key={c.id} className="text-sm">
                {i > 0 && (
                  <Badge variant="secondary" className="mr-1">
                    {c.logic}
                  </Badge>
                )}
                <Badge variant="outline">
                  {fields.find((f) => f.value === c.field)?.label || c.field}{' '}
                  {OPERATORS[getFieldType(c.field)]?.find((o) => o.value === c.operator)?.label || c.operator}{' '}
                  {c.value || '?'}
                </Badge>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
