import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MasterLender } from '@/hooks/useMasterLenders';
import { MultiSelectFilter } from '@/components/deals/MultiSelectFilter';
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
  // Filter mode
  filterMode: 'simple' | 'advanced';
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
  filterMode: 'simple',
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

// Simple filters component (legacy UI)
function SimpleFilters({
  filters,
  onFiltersChange,
  lenders,
}: LenderFiltersProps) {
  // Extract unique values for dropdowns
  const tierOptions = useMemo(() => 
    [{ value: 'T1', label: 'T1' }, { value: 'T2', label: 'T2' }, { value: 'T3', label: 'T3' }],
    []
  );

  const loanTypeOptions = useMemo(() => 
    Array.from(new Set(lenders.flatMap(l => l.loan_types || []).filter(Boolean)))
      .sort()
      .map(v => ({ value: v, label: v })),
    [lenders]
  );

  const industryOptions = useMemo(() => 
    Array.from(new Set(lenders.flatMap(l => l.industries || []).filter(Boolean)))
      .sort()
      .map(v => ({ value: v, label: v })),
    [lenders]
  );

  const geoOptions = useMemo(() => 
    Array.from(new Set(lenders.map(l => l.geo).filter(Boolean)))
      .sort()
      .map(v => ({ value: v!, label: v! })),
    [lenders]
  );

  const sponsorshipOptions = useMemo(() => 
    Array.from(new Set(lenders.map(l => l.sponsorship).filter(Boolean)))
      .sort()
      .map(v => ({ value: v!, label: v! })),
    [lenders]
  );

  const cashBurnOptions = useMemo(() => 
    Array.from(new Set(lenders.map(l => l.cash_burn).filter(Boolean)))
      .sort()
      .map(v => ({ value: v!, label: v! })),
    [lenders]
  );

  return (
    <div className="space-y-4">
      {/* Row 1: Search, Min Deal, Max Deal, Revenue, Sponsorship */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Search Name</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Lender or contact..."
              value={filters.searchQuery}
              onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Min Deal Size ($)</Label>
          <Input
            type="number"
            placeholder="e.g. 1000000"
            value={filters.minDealSize}
            onChange={(e) => onFiltersChange({ ...filters, minDealSize: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Max Deal Size ($)</Label>
          <Input
            type="number"
            placeholder="e.g. 50000000"
            value={filters.maxDealSize}
            onChange={(e) => onFiltersChange({ ...filters, maxDealSize: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Your Revenue ($)</Label>
          <Input
            type="number"
            placeholder="e.g. 5000000"
            value={filters.minRevenue}
            onChange={(e) => onFiltersChange({ ...filters, minRevenue: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Sponsorship</Label>
          <MultiSelectFilter
            label="Any"
            options={sponsorshipOptions}
            selected={filters.sponsorship ? [filters.sponsorship] : []}
            onChange={(selected) => onFiltersChange({ ...filters, sponsorship: selected[0] || '' })}
            className="w-full h-9"
          />
        </div>
      </div>

      {/* Row 2: Loan Type, Cash Burn, Industry, Geography, Tier */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Loan Type</Label>
          <MultiSelectFilter
            label="Any"
            options={loanTypeOptions}
            selected={filters.loanTypes}
            onChange={(selected) => onFiltersChange({ ...filters, loanTypes: selected })}
            className="w-full h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Cash Burn OK</Label>
          <MultiSelectFilter
            label="Any"
            options={cashBurnOptions}
            selected={filters.cashBurn ? [filters.cashBurn] : []}
            onChange={(selected) => onFiltersChange({ ...filters, cashBurn: selected[0] || '' })}
            className="w-full h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Industry</Label>
          <MultiSelectFilter
            label="Any"
            options={industryOptions}
            selected={filters.industries}
            onChange={(selected) => onFiltersChange({ ...filters, industries: selected })}
            className="w-full h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Geography</Label>
          <MultiSelectFilter
            label="Any"
            options={geoOptions}
            selected={filters.geographies}
            onChange={(selected) => onFiltersChange({ ...filters, geographies: selected })}
            className="w-full h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Tier</Label>
          <MultiSelectFilter
            label="Any"
            options={tierOptions}
            selected={filters.tiers}
            onChange={(selected) => onFiltersChange({ ...filters, tiers: selected })}
            className="w-full h-9"
          />
        </div>
      </div>
    </div>
  );
}

export function LenderFiltersPanel({ filters, onFiltersChange, lenders }: LenderFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Ensure filterMode has a default
  const filterMode = filters.filterMode || 'simple';

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery) count++;
    
    if (filterMode === 'advanced') {
      count += (filters.advancedConditions || []).length;
    } else {
      // Count simple filters
      if (filters.tiers?.length) count++;
      if (filters.minDealSize) count++;
      if (filters.maxDealSize) count++;
      if (filters.minRevenue) count++;
      if (filters.loanTypes?.length) count++;
      if (filters.industries?.length) count++;
      if (filters.geographies?.length) count++;
      if (filters.sponsorship) count++;
      if (filters.cashBurn) count++;
    }
    return count;
  }, [filters, filterMode]);

  const handleClearAll = useCallback(() => {
    onFiltersChange({ ...emptyFilters, filterMode });
  }, [onFiltersChange, filterMode]);

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, searchQuery: value });
  }, [filters, onFiltersChange]);

  const handleConditionsChange = useCallback((conditions: FilterCondition[]) => {
    onFiltersChange({ ...filters, advancedConditions: conditions });
  }, [filters, onFiltersChange]);

  const handleModeChange = useCallback((mode: string) => {
    onFiltersChange({ ...filters, filterMode: mode as 'simple' | 'advanced' });
  }, [filters, onFiltersChange]);

  const clearSearch = useCallback(() => {
    onFiltersChange({ ...filters, searchQuery: '' });
  }, [filters, onFiltersChange]);

  // Summarize conditions for display (advanced mode)
  const conditionSummaries = useMemo(() => {
    return (filters.advancedConditions || []).map((c) => {
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

  // Summarize simple filters for display
  const simpleFilterSummaries = useMemo(() => {
    const summaries: { key: string; label: string }[] = [];
    if (filters.tiers?.length) summaries.push({ key: 'tiers', label: `Tier: ${filters.tiers.join(', ')}` });
    if (filters.minDealSize) summaries.push({ key: 'minDeal', label: `Min Deal: $${filters.minDealSize}M` });
    if (filters.maxDealSize) summaries.push({ key: 'maxDeal', label: `Max Deal: $${filters.maxDealSize}M` });
    if (filters.minRevenue) summaries.push({ key: 'minRev', label: `Min Revenue: $${filters.minRevenue}M` });
    if (filters.loanTypes?.length) summaries.push({ key: 'loans', label: `Loans: ${filters.loanTypes.length > 2 ? `${filters.loanTypes.length} types` : filters.loanTypes.join(', ')}` });
    if (filters.industries?.length) summaries.push({ key: 'industries', label: `Industries: ${filters.industries.length > 2 ? `${filters.industries.length} selected` : filters.industries.join(', ')}` });
    if (filters.geographies?.length) summaries.push({ key: 'geo', label: `Geo: ${filters.geographies.length > 2 ? `${filters.geographies.length} selected` : filters.geographies.join(', ')}` });
    if (filters.sponsorship) summaries.push({ key: 'sponsor', label: `Sponsorship: ${filters.sponsorship}` });
    if (filters.cashBurn) summaries.push({ key: 'cashBurn', label: `Cash Burn: ${filters.cashBurn}` });
    return summaries;
  }, [filters]);

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
              <span className="font-medium">Filters</span>
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
            {/* Filter Mode Toggle */}
            <Tabs value={filterMode} onValueChange={handleModeChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="simple" className="text-xs">Simple</TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs">Advanced</TabsTrigger>
              </TabsList>
            </Tabs>

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
                {filterMode === 'advanced' && conditionSummaries.map(({ id, summary }) => (
                  <Badge key={id} variant="outline" className="gap-1 pr-1 max-w-[200px] truncate">
                    {summary}
                    <button
                      type="button"
                      onClick={() => {
                        handleConditionsChange(
                          (filters.advancedConditions || []).filter((c) => c.id !== id)
                        );
                      }}
                      className="ml-1 rounded-full hover:bg-muted p-0.5 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {filterMode === 'simple' && simpleFilterSummaries.map(({ key, label }) => (
                  <Badge key={key} variant="outline" className="gap-1 max-w-[200px] truncate">
                    {label}
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

            {/* Filter Content Based on Mode */}
            {filterMode === 'simple' ? (
              <SimpleFilters
                filters={filters}
                onFiltersChange={onFiltersChange}
                lenders={lenders}
              />
            ) : (
              <>
                {/* Search by Name (only for advanced mode) */}
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
                <AdvancedFilterBuilder
                  conditions={filters.advancedConditions || []}
                  onConditionsChange={handleConditionsChange}
                  lenders={lenders}
                />
              </>
            )}
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

  const filterMode = safeFilters.filterMode || 'simple';

  // Apply search query filter first
  if (safeFilters.searchQuery) {
    const query = safeFilters.searchQuery.toLowerCase();
    result = result.filter((lender) => {
      const nameMatch = lender.name?.toLowerCase().includes(query);
      const contactMatch = lender.contact_name?.toLowerCase().includes(query);
      return nameMatch || contactMatch;
    });
  }

  if (filterMode === 'advanced') {
    // Apply advanced conditions
    if (safeFilters.advancedConditions && safeFilters.advancedConditions.length > 0) {
      result = applyAdvancedFilters(result, safeFilters.advancedConditions);
    }
  } else {
    // Apply simple filters
    
    // Tier filter
    if (safeFilters.tiers && safeFilters.tiers.length > 0) {
      result = result.filter((lender) => 
        safeFilters.tiers.some(tier => lender.tier === tier)
      );
    }

    // Min deal size
    if (safeFilters.minDealSize) {
      const minDeal = parseFloat(safeFilters.minDealSize) * 1_000_000;
      result = result.filter((lender) => 
        lender.min_deal == null || lender.min_deal >= minDeal
      );
    }

    // Max deal size
    if (safeFilters.maxDealSize) {
      const maxDeal = parseFloat(safeFilters.maxDealSize) * 1_000_000;
      result = result.filter((lender) => 
        lender.max_deal == null || lender.max_deal <= maxDeal
      );
    }

    // Min revenue
    if (safeFilters.minRevenue) {
      const minRev = parseFloat(safeFilters.minRevenue) * 1_000_000;
      result = result.filter((lender) => 
        lender.min_revenue == null || lender.min_revenue >= minRev
      );
    }

    // Loan types
    if (safeFilters.loanTypes && safeFilters.loanTypes.length > 0) {
      result = result.filter((lender) => 
        lender.loan_types?.some(lt => safeFilters.loanTypes.includes(lt))
      );
    }

    // Industries
    if (safeFilters.industries && safeFilters.industries.length > 0) {
      result = result.filter((lender) => 
        lender.industries?.some(ind => safeFilters.industries.includes(ind))
      );
    }

    // Geographies
    if (safeFilters.geographies && safeFilters.geographies.length > 0) {
      result = result.filter((lender) => 
        safeFilters.geographies.includes(lender.geo || '')
      );
    }

    // Sponsorship
    if (safeFilters.sponsorship) {
      result = result.filter((lender) => 
        lender.sponsorship === safeFilters.sponsorship
      );
    }

    // Cash burn
    if (safeFilters.cashBurn) {
      result = result.filter((lender) => 
        lender.cash_burn === safeFilters.cashBurn
      );
    }
  }

  return result;
}

export { emptyFilters, generateId };
export type { FilterCondition };

