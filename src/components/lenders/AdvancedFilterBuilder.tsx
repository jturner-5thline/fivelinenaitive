import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/deals/MultiSelectFilter';
import { MasterLender } from '@/hooks/useMasterLenders';

// Define field types
type FieldType = 'boolean' | 'number' | 'select' | 'multiselect' | 'text';

// Define operators for each field type
type Operator = 
  | 'is' 
  | 'is_not' 
  | 'equals' 
  | 'not_equals' 
  | 'greater_than' 
  | 'less_than' 
  | 'greater_or_equal' 
  | 'less_or_equal'
  | 'has_any_of' 
  | 'has_none_of'
  | 'is_any_of'
  | 'contains'
  | 'not_contains';

type LogicalOperator = 'and' | 'or';

// Filter condition interface
export interface FilterCondition {
  id: string;
  field: string;
  operator: Operator;
  value: string | string[] | boolean | number | null;
  logicalOperator: LogicalOperator;
}

// Field definitions
interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  operators: { value: Operator; label: string }[];
  getOptions?: (lenders: MasterLender[]) => { value: string; label: string }[];
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: 'active',
    label: 'Active',
    type: 'boolean',
    operators: [
      { value: 'is', label: 'is' },
    ],
  },
  {
    key: 'tier',
    label: 'Tier',
    type: 'multiselect',
    operators: [
      { value: 'is_any_of', label: 'is any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: () => [
      { value: 'T1', label: 'T1' },
      { value: 'T2', label: 'T2' },
      { value: 'T3', label: 'T3' },
    ],
  },
  {
    key: 'lender_type',
    label: 'Lender Type',
    type: 'multiselect',
    operators: [
      { value: 'is_any_of', label: 'is any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.map(l => l.lender_type).filter(Boolean)))
        .sort()
        .map(v => ({ value: v!, label: v! })),
  },
  {
    key: 'min_deal',
    label: 'Min. Deal',
    type: 'number',
    operators: [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '≠' },
      { value: 'greater_than', label: '>' },
      { value: 'less_than', label: '<' },
      { value: 'greater_or_equal', label: '≥' },
      { value: 'less_or_equal', label: '≤' },
    ],
  },
  {
    key: 'max_deal',
    label: 'Max Deal',
    type: 'number',
    operators: [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '≠' },
      { value: 'greater_than', label: '>' },
      { value: 'less_than', label: '<' },
      { value: 'greater_or_equal', label: '≥' },
      { value: 'less_or_equal', label: '≤' },
    ],
  },
  {
    key: 'min_revenue',
    label: 'Min. Revenue',
    type: 'number',
    operators: [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '≠' },
      { value: 'greater_than', label: '>' },
      { value: 'less_than', label: '<' },
      { value: 'greater_or_equal', label: '≥' },
      { value: 'less_or_equal', label: '≤' },
    ],
  },
  {
    key: 'loan_types',
    label: 'Loan Type',
    type: 'multiselect',
    operators: [
      { value: 'has_any_of', label: 'has any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.flatMap(l => l.loan_types || []).filter(Boolean)))
        .sort()
        .map(v => ({ value: v, label: v })),
  },
  {
    key: 'industries',
    label: 'Industry',
    type: 'multiselect',
    operators: [
      { value: 'has_any_of', label: 'has any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.flatMap(l => l.industries || []).filter(Boolean)))
        .sort()
        .map(v => ({ value: v, label: v })),
  },
  {
    key: 'geo',
    label: 'Geography',
    type: 'multiselect',
    operators: [
      { value: 'is_any_of', label: 'is any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.map(l => l.geo).filter(Boolean)))
        .sort()
        .map(v => ({ value: v!, label: v! })),
  },
  {
    key: 'b2b_b2c',
    label: 'B2B | B2C',
    type: 'multiselect',
    operators: [
      { value: 'is_any_of', label: 'is any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.map(l => l.b2b_b2c).filter(Boolean)))
        .sort()
        .map(v => ({ value: v!, label: v! })),
  },
  {
    key: 'sponsorship',
    label: 'Sponsorship',
    type: 'multiselect',
    operators: [
      { value: 'is_any_of', label: 'is any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.map(l => l.sponsorship).filter(Boolean)))
        .sort()
        .map(v => ({ value: v!, label: v! })),
  },
  {
    key: 'cash_burn',
    label: 'Cash Burn',
    type: 'multiselect',
    operators: [
      { value: 'is_any_of', label: 'is any of' },
      { value: 'has_none_of', label: 'has none of' },
    ],
    getOptions: (lenders) => 
      Array.from(new Set(lenders.map(l => l.cash_burn).filter(Boolean)))
        .sort()
        .map(v => ({ value: v!, label: v! })),
  },
  {
    key: 'company_requirements',
    label: 'Company Req.',
    type: 'text',
    operators: [
      { value: 'contains', label: 'contains' },
      { value: 'not_contains', label: 'does not contain' },
    ],
  },
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    operators: [
      { value: 'contains', label: 'contains' },
      { value: 'not_contains', label: 'does not contain' },
    ],
  },
];

interface AdvancedFilterBuilderProps {
  conditions: FilterCondition[];
  onConditionsChange: (conditions: FilterCondition[]) => void;
  lenders: MasterLender[];
}

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Single condition row component
function ConditionRow({
  condition,
  index,
  lenders,
  onUpdate,
  onDelete,
  onLogicalOperatorChange,
}: {
  condition: FilterCondition;
  index: number;
  lenders: MasterLender[];
  onUpdate: (id: string, updates: Partial<FilterCondition>) => void;
  onDelete: (id: string) => void;
  onLogicalOperatorChange: (id: string, op: LogicalOperator) => void;
}) {
  const fieldDef = FIELD_DEFINITIONS.find(f => f.key === condition.field);
  const options = useMemo(() => 
    fieldDef?.getOptions?.(lenders) || [],
    [fieldDef, lenders]
  );

  const handleFieldChange = useCallback((field: string) => {
    const newFieldDef = FIELD_DEFINITIONS.find(f => f.key === field);
    const defaultOp = newFieldDef?.operators[0]?.value || 'is';
    let defaultValue: FilterCondition['value'] = null;
    
    if (newFieldDef?.type === 'boolean') {
      defaultValue = true;
    } else if (newFieldDef?.type === 'multiselect') {
      defaultValue = [];
    } else if (newFieldDef?.type === 'number') {
      defaultValue = '';
    } else {
      defaultValue = '';
    }
    
    onUpdate(condition.id, { field, operator: defaultOp, value: defaultValue });
  }, [condition.id, onUpdate]);

  const handleOperatorChange = useCallback((operator: Operator) => {
    onUpdate(condition.id, { operator });
  }, [condition.id, onUpdate]);

  const handleValueChange = useCallback((value: FilterCondition['value']) => {
    onUpdate(condition.id, { value });
  }, [condition.id, onUpdate]);

  // Render value input based on field type
  const renderValueInput = () => {
    if (!fieldDef) return null;

    switch (fieldDef.type) {
      case 'boolean':
        return (
          <Checkbox
            checked={condition.value === true}
            onCheckedChange={(checked) => handleValueChange(checked === true)}
            className="h-5 w-5 data-[state=checked]:bg-success data-[state=checked]:border-success"
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            placeholder="Enter value..."
            value={condition.value as string || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            className="h-9 w-40"
          />
        );

      case 'text':
        return (
          <Input
            type="text"
            placeholder="Enter text..."
            value={condition.value as string || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            className="h-9 w-40"
          />
        );

      case 'select':
      case 'multiselect':
        return (
          <div className="flex flex-wrap gap-1 items-center min-w-[150px] max-w-[300px]">
            <MultiSelectFilter
              label="Select..."
              options={options}
              selected={Array.isArray(condition.value) ? condition.value : []}
              onChange={(selected) => handleValueChange(selected)}
              className="h-9"
            />
            {Array.isArray(condition.value) && condition.value.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(condition.value as string[]).map((v) => (
                  <Badge
                    key={v}
                    className="text-xs bg-[#d0e7ff] text-[#1d4ed8] hover:bg-[#d0e7ff]"
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex items-start gap-2 py-2">
      {/* Logical operator or "Where" */}
      <div className="w-16 shrink-0">
        {index === 0 ? (
          <span className="text-sm text-muted-foreground font-medium">Where</span>
        ) : (
          <Select
            value={condition.logicalOperator}
            onValueChange={(v) => onLogicalOperatorChange(condition.id, v as LogicalOperator)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">and</SelectItem>
              <SelectItem value="or">or</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Field selector */}
      <Select value={condition.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="h-9 w-36">
          <SelectValue placeholder="Select field..." />
        </SelectTrigger>
        <SelectContent>
          {FIELD_DEFINITIONS.map((field) => (
            <SelectItem key={field.key} value={field.key}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      {fieldDef && (
        <Select value={condition.operator} onValueChange={(v) => handleOperatorChange(v as Operator)}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldDef.operators.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Value input */}
      {fieldDef && renderValueInput()}

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(condition.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* Drag handle (placeholder for future) */}
      <div className="h-9 w-6 flex items-center justify-center text-muted-foreground/50 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>
    </div>
  );
}

export function AdvancedFilterBuilder({
  conditions,
  onConditionsChange,
  lenders,
}: AdvancedFilterBuilderProps) {
  const addCondition = useCallback(() => {
    const newCondition: FilterCondition = {
      id: generateId(),
      field: 'active',
      operator: 'is',
      value: true,
      logicalOperator: 'and',
    };
    onConditionsChange([...conditions, newCondition]);
  }, [conditions, onConditionsChange]);

  const updateCondition = useCallback((id: string, updates: Partial<FilterCondition>) => {
    onConditionsChange(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, [conditions, onConditionsChange]);

  const deleteCondition = useCallback((id: string) => {
    onConditionsChange(conditions.filter((c) => c.id !== id));
  }, [conditions, onConditionsChange]);

  const updateLogicalOperator = useCallback((id: string, op: LogicalOperator) => {
    onConditionsChange(
      conditions.map((c) => (c.id === id ? { ...c, logicalOperator: op } : c))
    );
  }, [conditions, onConditionsChange]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">In this view, show records</p>
      
      {/* Condition rows */}
      <div className="space-y-1">
        {conditions.map((condition, index) => (
          <ConditionRow
            key={condition.id}
            condition={condition}
            index={index}
            lenders={lenders}
            onUpdate={updateCondition}
            onDelete={deleteCondition}
            onLogicalOperatorChange={updateLogicalOperator}
          />
        ))}
      </div>

      {/* Add condition button */}
      <div className="flex items-center gap-4 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-primary gap-1"
          onClick={addCondition}
        >
          <Plus className="h-4 w-4" />
          Add condition
        </Button>
      </div>
    </div>
  );
}

// Apply filter conditions to lenders
export function applyAdvancedFilters(
  lenders: MasterLender[],
  conditions: FilterCondition[]
): MasterLender[] {
  if (conditions.length === 0) return lenders;

  return lenders.filter((lender) => {
    let result = true;
    let previousLogicalOp: LogicalOperator = 'and';

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const conditionResult = evaluateCondition(lender, condition);

      if (i === 0) {
        result = conditionResult;
      } else {
        if (previousLogicalOp === 'and') {
          result = result && conditionResult;
        } else {
          result = result || conditionResult;
        }
      }

      previousLogicalOp = condition.logicalOperator;
    }

    return result;
  });
}

function evaluateCondition(lender: MasterLender, condition: FilterCondition): boolean {
  const { field, operator, value } = condition;
  const lenderValue = (lender as unknown as Record<string, unknown>)[field];

  switch (operator) {
    case 'is':
      if (typeof value === 'boolean') {
        return lenderValue === value;
      }
      return lenderValue === value;

    case 'is_not':
      return lenderValue !== value;

    case 'equals':
      if (value === '' || value === null) return true;
      const numVal = typeof value === 'string' ? parseFloat(value) : value;
      return lenderValue === numVal;

    case 'not_equals':
      if (value === '' || value === null) return true;
      const numValNe = typeof value === 'string' ? parseFloat(value) : value;
      return lenderValue !== numValNe;

    case 'greater_than':
      if (value === '' || value === null) return true;
      const gtVal = typeof value === 'string' ? parseFloat(value) : value as number;
      return typeof lenderValue === 'number' && lenderValue > gtVal;

    case 'less_than':
      if (value === '' || value === null) return true;
      const ltVal = typeof value === 'string' ? parseFloat(value) : value as number;
      return typeof lenderValue === 'number' && lenderValue < ltVal;

    case 'greater_or_equal':
      if (value === '' || value === null) return true;
      const geVal = typeof value === 'string' ? parseFloat(value) : value as number;
      return typeof lenderValue === 'number' && lenderValue >= geVal;

    case 'less_or_equal':
      if (value === '' || value === null) return true;
      const leVal = typeof value === 'string' ? parseFloat(value) : value as number;
      return typeof lenderValue === 'number' && lenderValue <= leVal;

    case 'has_any_of':
    case 'is_any_of':
      if (!Array.isArray(value) || value.length === 0) return true;
      if (Array.isArray(lenderValue)) {
        return value.some((v) => lenderValue.includes(v));
      }
      return value.includes(lenderValue as string);

    case 'has_none_of':
      if (!Array.isArray(value) || value.length === 0) return true;
      if (Array.isArray(lenderValue)) {
        return !value.some((v) => lenderValue.includes(v));
      }
      return !value.includes(lenderValue as string);

    case 'contains':
      if (!value || value === '') return true;
      return typeof lenderValue === 'string' && 
        lenderValue.toLowerCase().includes((value as string).toLowerCase());

    case 'not_contains':
      if (!value || value === '') return true;
      return typeof lenderValue === 'string' && 
        !lenderValue.toLowerCase().includes((value as string).toLowerCase());

    default:
      return true;
  }
}

export { FIELD_DEFINITIONS, generateId };
export type { FieldDefinition, Operator, LogicalOperator };
