export interface FilterField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'enum';
  options?: { label: string; value: string }[];
  category?: string;
}

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean | string[];
}

export type MatchMode = 'all' | 'any';

export const OPERATORS_BY_TYPE: Record<FilterField['type'], { value: string; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'does_not_contain', label: 'does not contain' },
    { value: 'equals', label: 'is equal to' },
    { value: 'not_equals', label: 'is not equal to' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: 'is equal to' },
    { value: 'not_equals', label: 'is not equal to' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
    { value: 'greater_or_equal', label: 'greater or equal' },
    { value: 'less_or_equal', label: 'less or equal' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: 'equals', label: 'is' },
    { value: 'before', label: 'is before' },
    { value: 'after', label: 'is after' },
    { value: 'in_last_days', label: 'in the last X days' },
    { value: 'in_next_days', label: 'in the next X days' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  boolean: [
    { value: 'is_true', label: 'is true' },
    { value: 'is_false', label: 'is false' },
  ],
  enum: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'is_any_of', label: 'is any of' },
    { value: 'is_none_of', label: 'is none of' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
};

const NO_VALUE_OPS = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];

export function operatorNeedsValue(op: string): boolean {
  return !NO_VALUE_OPS.includes(op);
}

export function createEmptyRule(): FilterRule {
  return { id: crypto.randomUUID(), field: '', operator: '', value: '' };
}
