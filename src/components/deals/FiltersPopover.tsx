import { useState } from 'react';
import { Filter, X, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

export type FilterKey = 'stage' | 'status' | 'engagementType' | 'dealType' | 'manager' | 'lender' | 'referredBy';

export const FILTER_LABELS: Record<FilterKey, string> = {
  stage: 'Stage',
  status: 'Status',
  engagementType: 'Engagement',
  dealType: 'Deal Type',
  manager: 'Manager',
  lender: 'Lender',
  referredBy: 'Referred By',
};

interface FiltersPopoverProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  activeFiltersCount: number;
  pinnedFilters: FilterKey[];
  onTogglePin: (key: FilterKey) => void;
}

export function FiltersPopover({
  filters,
  onFilterChange,
  activeFiltersCount,
  pinnedFilters,
  onTogglePin,
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

  const filterConfigs: { key: FilterKey; options: { value: string; label: string }[]; onChange: (values: string[]) => void }[] = [
    { 
      key: 'stage', 
      options: stageOptions, 
      onChange: (stage) => onFilterChange({ stage: stage as DealStage[] }) 
    },
    { 
      key: 'status', 
      options: statusOptions, 
      onChange: (status) => onFilterChange({ status: status as DealStatus[] }) 
    },
    { 
      key: 'engagementType', 
      options: engagementTypeOptions, 
      onChange: (engagementType) => onFilterChange({ engagementType: engagementType as EngagementType[] }) 
    },
    { 
      key: 'dealType', 
      options: dealTypeOptions, 
      onChange: (dealType) => onFilterChange({ dealType }) 
    },
    { 
      key: 'manager', 
      options: managerOptions, 
      onChange: (manager) => onFilterChange({ manager }) 
    },
    { 
      key: 'lender', 
      options: lenderOptions, 
      onChange: (lender) => onFilterChange({ lender }) 
    },
    { 
      key: 'referredBy', 
      options: referredByOptions, 
      onChange: (referredBy) => onFilterChange({ referredBy }) 
    },
  ];

  const isPinned = (key: FilterKey) => pinnedFilters.includes(key);
  const canPin = pinnedFilters.length < 4;

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
        className="w-[min(20rem,calc(100vw-2rem))] p-0 bg-popover border border-border shadow-lg max-h-[min(520px,var(--radix-popper-available-height))] overflow-hidden flex flex-col" 
        align="start"
        side="bottom"
        sideOffset={8}
        avoidCollisions
        collisionPadding={16}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filters</span>
            <span className="text-xs text-muted-foreground">
              (Pin up to 4)
            </span>
          </div>
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
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {filterConfigs.map((config, index) => {
              const pinned = isPinned(config.key);
              return (
                <div key={config.key}>
                  {index === 3 && <Separator className="my-3" />}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        {FILTER_LABELS[config.key]}
                      </label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => onTogglePin(config.key)}
                            disabled={!pinned && !canPin}
                          >
                            {pinned ? (
                              <PinOff className="h-3 w-3 text-primary" />
                            ) : (
                              <Pin className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {pinned ? 'Unpin from toolbar' : canPin ? 'Pin to toolbar' : 'Max 4 pinned'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <MultiSelectFilter
                      label={`Select ${FILTER_LABELS[config.key].toLowerCase()}`}
                      options={config.options}
                      selected={filters[config.key] as string[]}
                      onChange={config.onChange}
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Export filter configs for use in quick filters
export function useFilterConfigs() {
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

  return {
    stage: stageOptions,
    status: statusOptions,
    engagementType: engagementTypeOptions,
    dealType: dealTypeOptions,
    manager: managerOptions,
    lender: lenderOptions,
    referredBy: referredByOptions,
  };
}
