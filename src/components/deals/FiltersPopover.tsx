import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { DealFilters as FilterType } from '@/hooks/useDeals';
import { 
  DealStage, 
  DealStatus, 
  EngagementType,
  STAGE_CONFIG, 
  STATUS_CONFIG, 
  ENGAGEMENT_TYPE_CONFIG,
  MANAGERS,
  LENDERS,
} from '@/types/deal';
import { mockReferrers } from '@/data/mockDeals';
import { MultiSelectFilter } from './MultiSelectFilter';
import { useDealTypes } from '@/contexts/DealTypesContext';

interface FiltersPopoverProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  activeFiltersCount: number;
}

export function FiltersPopover({
  filters,
  onFilterChange,
  activeFiltersCount,
}: FiltersPopoverProps) {
  const [open, setOpen] = useState(false);
  const { dealTypes: availableDealTypes } = useDealTypes();

  const stageOptions = Object.entries(STAGE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const statusOptions = Object.entries(STATUS_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const engagementTypeOptions = Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const dealTypeOptions = availableDealTypes.map(dt => ({
    value: dt.id,
    label: dt.label,
  }));

  const managerOptions = MANAGERS.map((manager) => ({
    value: manager,
    label: manager,
  }));

  const lenderOptions = LENDERS.map((lender) => ({
    value: lender,
    label: lender,
  }));

  const referredByOptions = mockReferrers.map((referrer) => ({
    value: referrer.id,
    label: referrer.name,
  }));

  const clearAllFilters = () => {
    onFilterChange({
      stage: [],
      status: [],
      engagementType: [],
      dealType: [],
      manager: [],
      lender: [],
      referredBy: [],
      staleOnly: false,
      flaggedOnly: false,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 h-9 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFiltersCount > 0 && (
            <Badge 
              variant="secondary" 
              className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 bg-popover border border-border shadow-lg" 
        align="start"
        sideOffset={8}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-medium">Filters</span>
          {activeFiltersCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearAllFilters}
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear all
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Stage</label>
              <MultiSelectFilter
                label="Select stages"
                options={stageOptions}
                selected={filters.stage}
                onChange={(stage) => onFilterChange({ stage: stage as DealStage[] })}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <MultiSelectFilter
                label="Select statuses"
                options={statusOptions}
                selected={filters.status}
                onChange={(status) => onFilterChange({ status: status as DealStatus[] })}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Engagement</label>
              <MultiSelectFilter
                label="Select engagement"
                options={engagementTypeOptions}
                selected={filters.engagementType}
                onChange={(engagementType) => onFilterChange({ engagementType: engagementType as EngagementType[] })}
                className="w-full"
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Deal Type</label>
              <MultiSelectFilter
                label="Select deal types"
                options={dealTypeOptions}
                selected={filters.dealType}
                onChange={(dealType) => onFilterChange({ dealType })}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Manager</label>
              <MultiSelectFilter
                label="Select managers"
                options={managerOptions}
                selected={filters.manager}
                onChange={(manager) => onFilterChange({ manager })}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Lender</label>
              <MultiSelectFilter
                label="Select lenders"
                options={lenderOptions}
                selected={filters.lender}
                onChange={(lender) => onFilterChange({ lender })}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Referred By</label>
              <MultiSelectFilter
                label="Select referrers"
                options={referredByOptions}
                selected={filters.referredBy}
                onChange={(referredBy) => onFilterChange({ referredBy })}
                className="w-full"
              />
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
