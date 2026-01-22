import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MultiSelectFilter } from '@/components/deals/MultiSelectFilter';
import { MasterLender } from '@/hooks/useMasterLenders';

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
};

interface LenderFiltersProps {
  filters: LenderFilters;
  onFiltersChange: (filters: LenderFilters) => void;
  lenders: MasterLender[];
}

// Debounced input component for number fields
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

  // Sync local value when external value changes (e.g., clear all)
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

  // Cleanup timeout on unmount
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

  // Memoize unique values extraction to avoid recalculating on every render
  const uniqueLoanTypes = useMemo(() => 
    Array.from(new Set(lenders.flatMap(l => l.loan_types || []).filter(Boolean))).sort(),
    [lenders]
  );

  const uniqueIndustries = useMemo(() => 
    Array.from(new Set(lenders.flatMap(l => l.industries || []).filter(Boolean))).sort(),
    [lenders]
  );

  const uniqueSponsorships = useMemo(() => 
    Array.from(new Set(lenders.map(l => l.sponsorship).filter(Boolean))).sort() as string[],
    [lenders]
  );

  const uniqueCashBurn = useMemo(() => 
    Array.from(new Set(lenders.map(l => l.cash_burn).filter(Boolean))).sort() as string[],
    [lenders]
  );

  const uniqueGeographies = useMemo(() => 
    Array.from(new Set(lenders.map(l => l.geo).filter(Boolean))).sort() as string[],
    [lenders]
  );

  // Tier options - fixed values
  const tierOptions = useMemo(() => [
    { value: 'T1', label: 'T1' },
    { value: 'T2', label: 'T2' },
    { value: 'T3', label: 'T3' },
  ], []);

  // Options for multi-select filters
  const loanTypeOptions = useMemo(() => 
    uniqueLoanTypes.map(lt => ({ value: lt, label: lt })),
    [uniqueLoanTypes]
  );

  const industryOptions = useMemo(() => 
    uniqueIndustries.map(ind => ({ value: ind, label: ind })),
    [uniqueIndustries]
  );

  const geographyOptions = useMemo(() => 
    uniqueGeographies.map(geo => ({ value: geo, label: geo })),
    [uniqueGeographies]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery) count++;
    if (filters.minDealSize) count++;
    if (filters.maxDealSize) count++;
    if (filters.minRevenue) count++;
    if (filters.sponsorship) count++;
    if (filters.cashBurn) count++;
    if (filters.loanTypes.length > 0) count++;
    if (filters.industries.length > 0) count++;
    if (filters.geographies.length > 0) count++;
    if (filters.tiers.length > 0) count++;
    return count;
  }, [filters]);

  const handleClearAll = useCallback(() => {
    onFiltersChange(emptyFilters);
  }, [onFiltersChange]);

  const handleFilterChange = useCallback((key: keyof LenderFilters, value: string | string[]) => {
    onFiltersChange({ ...filters, [key]: value });
  }, [filters, onFiltersChange]);

  const clearFilter = useCallback((key: keyof LenderFilters) => {
    const isArrayField = key === 'loanTypes' || key === 'industries' || key === 'geographies' || key === 'tiers';
    onFiltersChange({ ...filters, [key]: isArrayField ? [] : '' });
  }, [filters, onFiltersChange]);

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
            {/* Active Filters */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {filters.searchQuery && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Search: "{filters.searchQuery}"
                    <button
                      type="button"
                      onClick={() => clearFilter('searchQuery')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.minDealSize && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Min Deal: ${filters.minDealSize}
                    <button
                      type="button"
                      onClick={() => clearFilter('minDealSize')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.maxDealSize && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Max Deal: ${filters.maxDealSize}
                    <button
                      type="button"
                      onClick={() => clearFilter('maxDealSize')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.minRevenue && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Min Revenue: ${filters.minRevenue}
                    <button
                      type="button"
                      onClick={() => clearFilter('minRevenue')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.sponsorship && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Sponsorship: {filters.sponsorship}
                    <button
                      type="button"
                      onClick={() => clearFilter('sponsorship')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.loanTypes.length > 0 && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Loan Types: {filters.loanTypes.length === 1 ? filters.loanTypes[0] : `${filters.loanTypes.length} selected`}
                    <button
                      type="button"
                      onClick={() => clearFilter('loanTypes')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.cashBurn && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Cash Burn: {filters.cashBurn}
                    <button
                      type="button"
                      onClick={() => clearFilter('cashBurn')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.industries.length > 0 && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Industries: {filters.industries.length === 1 ? filters.industries[0] : `${filters.industries.length} selected`}
                    <button
                      type="button"
                      onClick={() => clearFilter('industries')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.geographies.length > 0 && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Geography: {filters.geographies.length === 1 ? filters.geographies[0] : `${filters.geographies.length} selected`}
                    <button
                      type="button"
                      onClick={() => clearFilter('geographies')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.tiers.length > 0 && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    Tier: {filters.tiers.length === 1 ? filters.tiers[0] : `${filters.tiers.length} selected`}
                    <button
                      type="button"
                      onClick={() => clearFilter('tiers')}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
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

            {/* Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {/* Search by Name */}
              <div className="space-y-1.5">
                <Label htmlFor="searchQuery" className="text-xs">
                  Search Name
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <DebouncedInput
                    id="searchQuery"
                    type="text"
                    placeholder="Lender or contact..."
                    value={filters.searchQuery}
                    onChange={(value) => handleFilterChange('searchQuery', value)}
                    className="h-9 pl-8"
                    debounceMs={300}
                  />
                </div>
              </div>

              {/* Min Deal Size */}
              <div className="space-y-1.5">
                <Label htmlFor="minDealSize" className="text-xs">
                  Min Deal Size ($)
                </Label>
                <DebouncedInput
                  id="minDealSize"
                  type="number"
                  placeholder="e.g. 1000000"
                  value={filters.minDealSize}
                  onChange={(value) => handleFilterChange('minDealSize', value)}
                  className="h-9"
                  debounceMs={400}
                />
              </div>

              {/* Max Deal Size */}
              <div className="space-y-1.5">
                <Label htmlFor="maxDealSize" className="text-xs">
                  Max Deal Size ($)
                </Label>
                <DebouncedInput
                  id="maxDealSize"
                  type="number"
                  placeholder="e.g. 50000000"
                  value={filters.maxDealSize}
                  onChange={(value) => handleFilterChange('maxDealSize', value)}
                  className="h-9"
                  debounceMs={400}
                />
              </div>

              {/* Min Revenue */}
              <div className="space-y-1.5">
                <Label htmlFor="minRevenue" className="text-xs">
                  Your Revenue ($)
                </Label>
                <DebouncedInput
                  id="minRevenue"
                  type="number"
                  placeholder="e.g. 5000000"
                  value={filters.minRevenue}
                  onChange={(value) => handleFilterChange('minRevenue', value)}
                  className="h-9"
                  debounceMs={400}
                />
              </div>

              {/* Sponsorship */}
              <div className="space-y-1.5">
                <Label className="text-xs">Sponsorship</Label>
                <Select
                  value={filters.sponsorship}
                  onValueChange={(value) => handleFilterChange('sponsorship', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {uniqueSponsorships.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Loan Type - Multi-select */}
              <div className="space-y-1.5">
                <Label className="text-xs">Loan Type</Label>
                <MultiSelectFilter
                  label="Any"
                  options={loanTypeOptions}
                  selected={filters.loanTypes}
                  onChange={(selected) => handleFilterChange('loanTypes', selected)}
                  className="h-9 w-full"
                />
              </div>

              {/* Cash Burn */}
              <div className="space-y-1.5">
                <Label className="text-xs">Cash Burn OK</Label>
                <Select
                  value={filters.cashBurn}
                  onValueChange={(value) => handleFilterChange('cashBurn', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {uniqueCashBurn.map((cb) => (
                      <SelectItem key={cb} value={cb}>
                        {cb}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Industry - Multi-select */}
              <div className="space-y-1.5">
                <Label className="text-xs">Industry</Label>
                <MultiSelectFilter
                  label="Any"
                  options={industryOptions}
                  selected={filters.industries}
                  onChange={(selected) => handleFilterChange('industries', selected)}
                  className="h-9 w-full"
                />
              </div>

              {/* Geography - Multi-select */}
              <div className="space-y-1.5">
                <Label className="text-xs">Geography</Label>
                <MultiSelectFilter
                  label="Any"
                  options={geographyOptions}
                  selected={filters.geographies}
                  onChange={(selected) => handleFilterChange('geographies', selected)}
                  className="h-9 w-full"
                />
              </div>

              {/* Tier - Multi-select */}
              <div className="space-y-1.5">
                <Label className="text-xs">Tier</Label>
                <MultiSelectFilter
                  label="Any"
                  options={tierOptions}
                  selected={filters.tiers}
                  onChange={(selected) => handleFilterChange('tiers', selected)}
                  className="h-9 w-full"
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Filter function to apply filters to lenders
export function applyLenderFilters(lenders: MasterLender[], filters: LenderFilters): MasterLender[] {
  return lenders.filter((lender) => {
    // Search query filter - matches lender name or contact name
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const nameMatch = lender.name?.toLowerCase().includes(query);
      const contactMatch = lender.contact_name?.toLowerCase().includes(query);
      if (!nameMatch && !contactMatch) {
        return false;
      }
    }

    // Min Deal Size filter - lender's max_deal should be >= user's min requirement
    if (filters.minDealSize) {
      const minRequired = parseFloat(filters.minDealSize);
      if (lender.max_deal !== null && lender.max_deal < minRequired) {
        return false;
      }
    }

    // Max Deal Size filter - lender's min_deal should be <= user's max limit
    if (filters.maxDealSize) {
      const maxLimit = parseFloat(filters.maxDealSize);
      if (lender.min_deal !== null && lender.min_deal > maxLimit) {
        return false;
      }
    }

    // Min Revenue filter - lender's min_revenue should be <= user's revenue
    if (filters.minRevenue) {
      const userRevenue = parseFloat(filters.minRevenue);
      if (lender.min_revenue !== null && lender.min_revenue > userRevenue) {
        return false;
      }
    }

    // Sponsorship filter
    if (filters.sponsorship && filters.sponsorship !== 'all') {
      if (lender.sponsorship !== filters.sponsorship) {
        return false;
      }
    }

    // Loan Types filter (multi-select - lender must have at least one matching type)
    if (filters.loanTypes.length > 0) {
      const hasMatchingLoanType = filters.loanTypes.some(lt => 
        lender.loan_types?.includes(lt)
      );
      if (!hasMatchingLoanType) {
        return false;
      }
    }

    // Cash Burn filter
    if (filters.cashBurn && filters.cashBurn !== 'all') {
      if (lender.cash_burn !== filters.cashBurn) {
        return false;
      }
    }

    // Industries filter (multi-select - lender must have at least one matching industry)
    if (filters.industries.length > 0) {
      const hasMatchingIndustry = filters.industries.some(ind => 
        lender.industries?.includes(ind)
      );
      if (!hasMatchingIndustry) {
        return false;
      }
    }

    // Geography filter (multi-select - lender must match at least one geography)
    if (filters.geographies.length > 0) {
      const hasMatchingGeo = filters.geographies.some(geo => 
        lender.geo === geo
      );
      if (!hasMatchingGeo) {
        return false;
      }
    }

    // Tier filter (multi-select - lender must match at least one tier)
    if (filters.tiers.length > 0) {
      const hasMatchingTier = filters.tiers.some(tier => 
        lender.tier === tier
      );
      if (!hasMatchingTier) {
        return false;
      }
    }

    return true;
  });
}

export { emptyFilters };
