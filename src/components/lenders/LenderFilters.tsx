import { useState } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
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
import { MasterLender } from '@/hooks/useMasterLenders';

export interface LenderFilters {
  minDealSize: string;
  maxDealSize: string;
  sponsorship: string;
  loanType: string;
  cashBurn: string;
  industry: string;
}

const emptyFilters: LenderFilters = {
  minDealSize: '',
  maxDealSize: '',
  sponsorship: '',
  loanType: '',
  cashBurn: '',
  industry: '',
};

interface LenderFiltersProps {
  filters: LenderFilters;
  onFiltersChange: (filters: LenderFilters) => void;
  lenders: MasterLender[];
}

export function LenderFiltersPanel({ filters, onFiltersChange, lenders }: LenderFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Extract unique values for dropdowns
  const uniqueLoanTypes = Array.from(
    new Set(lenders.flatMap(l => l.loan_types || []).filter(Boolean))
  ).sort();

  const uniqueIndustries = Array.from(
    new Set(lenders.flatMap(l => l.industries || []).filter(Boolean))
  ).sort();

  const uniqueSponsorships = Array.from(
    new Set(lenders.map(l => l.sponsorship).filter(Boolean))
  ).sort() as string[];

  const uniqueCashBurn = Array.from(
    new Set(lenders.map(l => l.cash_burn).filter(Boolean))
  ).sort() as string[];

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  const handleClearAll = () => {
    onFiltersChange(emptyFilters);
  };

  const handleFilterChange = (key: keyof LenderFilters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilter = (key: keyof LenderFilters) => {
    onFiltersChange({ ...filters, [key]: '' });
  };

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
                {filters.minDealSize && (
                  <Badge variant="outline" className="gap-1">
                    Min Deal: ${filters.minDealSize}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => clearFilter('minDealSize')}
                    />
                  </Badge>
                )}
                {filters.maxDealSize && (
                  <Badge variant="outline" className="gap-1">
                    Max Deal: ${filters.maxDealSize}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => clearFilter('maxDealSize')}
                    />
                  </Badge>
                )}
                {filters.sponsorship && (
                  <Badge variant="outline" className="gap-1">
                    Sponsorship: {filters.sponsorship}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => clearFilter('sponsorship')}
                    />
                  </Badge>
                )}
                {filters.loanType && (
                  <Badge variant="outline" className="gap-1">
                    Loan Type: {filters.loanType}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => clearFilter('loanType')}
                    />
                  </Badge>
                )}
                {filters.cashBurn && (
                  <Badge variant="outline" className="gap-1">
                    Cash Burn: {filters.cashBurn}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => clearFilter('cashBurn')}
                    />
                  </Badge>
                )}
                {filters.industry && (
                  <Badge variant="outline" className="gap-1">
                    Industry: {filters.industry}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => clearFilter('industry')}
                    />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Min Deal Size */}
              <div className="space-y-1.5">
                <Label htmlFor="minDealSize" className="text-xs">
                  Min Deal Size ($)
                </Label>
                <Input
                  id="minDealSize"
                  type="number"
                  placeholder="e.g. 1000000"
                  value={filters.minDealSize}
                  onChange={(e) => handleFilterChange('minDealSize', e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Max Deal Size */}
              <div className="space-y-1.5">
                <Label htmlFor="maxDealSize" className="text-xs">
                  Max Deal Size ($)
                </Label>
                <Input
                  id="maxDealSize"
                  type="number"
                  placeholder="e.g. 50000000"
                  value={filters.maxDealSize}
                  onChange={(e) => handleFilterChange('maxDealSize', e.target.value)}
                  className="h-9"
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

              {/* Loan Type */}
              <div className="space-y-1.5">
                <Label className="text-xs">Loan Type</Label>
                <Select
                  value={filters.loanType}
                  onValueChange={(value) => handleFilterChange('loanType', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {uniqueLoanTypes.map((lt) => (
                      <SelectItem key={lt} value={lt}>
                        {lt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              {/* Industry */}
              <div className="space-y-1.5">
                <Label className="text-xs">Industry</Label>
                <Select
                  value={filters.industry}
                  onValueChange={(value) => handleFilterChange('industry', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {uniqueIndustries.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

    // Sponsorship filter
    if (filters.sponsorship && filters.sponsorship !== 'all') {
      if (lender.sponsorship !== filters.sponsorship) {
        return false;
      }
    }

    // Loan Type filter
    if (filters.loanType && filters.loanType !== 'all') {
      if (!lender.loan_types?.includes(filters.loanType)) {
        return false;
      }
    }

    // Cash Burn filter
    if (filters.cashBurn && filters.cashBurn !== 'all') {
      if (lender.cash_burn !== filters.cashBurn) {
        return false;
      }
    }

    // Industry filter
    if (filters.industry && filters.industry !== 'all') {
      if (!lender.industries?.includes(filters.industry)) {
        return false;
      }
    }

    return true;
  });
}

export { emptyFilters };
