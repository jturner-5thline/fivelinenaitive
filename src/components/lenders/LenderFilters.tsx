import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MasterLender } from '@/hooks/useMasterLenders';
import { 
  AdvancedFilterBuilder, 
  FilterCondition, 
  applyAdvancedFilters,
  generateId 
} from './AdvancedFilterBuilder';

// Legacy interface for backward compatibility
export interface LenderFilters {
  searchQuery: string;
  minDealSize: string;
  maxDealSize: string;
  minRevenue: string;
  sponsorship: string;
  loanTypes: string[];
  cashBurn: string;
  industries: string[];
  geographies: string[];
  tiers: string[];
  // New advanced conditions
  advancedConditions: FilterCondition[];
}

const emptyFilters: LenderFilters = {
  searchQuery: '',
  minDealSize: '',
  maxDealSize: '',
  minRevenue: '',
  sponsorship: '',
  loanTypes: [],
  cashBurn: '',
  industries: [],
  geographies: [],
  tiers: [],
  advancedConditions: [],
};

interface LenderFiltersProps {
  filters: LenderFilters;
  onFiltersChange: (filters: LenderFilters) => void;
  lenders: MasterLender[];
}

// Debounced input component for search field
function DebouncedInput({ 
  value, 
  onChange, 
  debounceMs = 400,
  ...props 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  debounceMs?: number;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, debounceMs);
  }, [onChange, debounceMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return <Input {...props} value={localValue} onChange={handleChange} />;
}

export function LenderFiltersPanel({ filters, onFiltersChange, lenders }: LenderFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery) count++;
    count += filters.advancedConditions.length;
    return count;
  }, [filters]);

  const handleClearAll = useCallback(() => {
    onFiltersChange(emptyFilters);
  }, [onFiltersChange]);

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, searchQuery: value });
  }, [filters, onFiltersChange]);

  const handleConditionsChange = useCallback((conditions: FilterCondition[]) => {
    onFiltersChange({ ...filters, advancedConditions: conditions });
  }, [filters, onFiltersChange]);

  const clearSearch = useCallback(() => {
    onFiltersChange({ ...filters, searchQuery: '' });
  }, [filters, onFiltersChange]);

  // Summarize conditions for display
  const conditionSummaries = useMemo(() => {
    return filters.advancedConditions.map((c) => {
      const fieldLabel = c.field.replace(/_/g, ' ');
      let valueStr = '';
      if (typeof c.value === 'boolean') {
        valueStr = c.value ? '✓' : '✗';
      } else if (Array.isArray(c.value)) {
        valueStr = c.value.length > 2 
          ? `${c.value.length} selected` 
          : c.value.join(', ');
      } else {
        valueStr = String(c.value || '');
      }
      return { id: c.id, summary: `${fieldLabel} ${c.operator.replace(/_/g, ' ')} ${valueStr}` };
    });
  }, [filters.advancedConditions]);

  return (
    <div className="border rounded-lg bg-card">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-3 h-auto"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Advanced Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount} active
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4 pt-0 space-y-4">
            {/* Active Filters Summary */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {filters.searchQuery && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Search: "{filters.searchQuery}"
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {conditionSummaries.map(({ id, summary }) => (
                  <Badge key={id} variant="outline" className="gap-1 pr-1 max-w-[200px] truncate">
                    {summary}
                    <button
                      type="button"
                      onClick={() => {
                        handleConditionsChange(
                          filters.advancedConditions.filter((c) => c.id !== id)
                        );
                      }}
                      className="ml-1 rounded-full hover:bg-muted p-0.5 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-6 text-xs"
                >
                  Clear All
                </Button>
              </div>
            )}

            {/* Search by Name */}
            <div className="space-y-1.5">
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <DebouncedInput
                  type="text"
                  placeholder="Search by lender name or contact..."
                  value={filters.searchQuery}
                  onChange={handleSearchChange}
                  className="h-9 pl-8"
                  debounceMs={300}
                />
              </div>
            </div>

            {/* Advanced Filter Builder */}
            <AdvancedFilterBuilder
              conditions={filters.advancedConditions}
              onConditionsChange={handleConditionsChange}
              lenders={lenders}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Filter function to apply all filters to lenders
export function applyLenderFilters(lenders: MasterLender[], filters: LenderFilters): MasterLender[] {
  let result = lenders;

  // Ensure filters has required properties with fallbacks
  const safeFilters = {
    ...emptyFilters,
    ...filters,
  };

  // Apply search query filter first
  if (safeFilters.searchQuery) {
    const query = safeFilters.searchQuery.toLowerCase();
    result = result.filter((lender) => {
      const nameMatch = lender.name?.toLowerCase().includes(query);
      const contactMatch = lender.contact_name?.toLowerCase().includes(query);
      return nameMatch || contactMatch;
    });
  }

  // Apply advanced conditions
  if (safeFilters.advancedConditions && safeFilters.advancedConditions.length > 0) {
    result = applyAdvancedFilters(result, safeFilters.advancedConditions);
  }

  // Legacy filter support for backward compatibility
  if (safeFilters.tiers && safeFilters.tiers.length > 0) {
    result = result.filter((lender) => 
      safeFilters.tiers.some(tier => lender.tier === tier)
    );
  }

  return result;
}

export { emptyFilters, generateId };
export type { FilterCondition };

