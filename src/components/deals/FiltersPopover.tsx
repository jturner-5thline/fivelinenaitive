import { useState, useMemo } from 'react';
import { Filter, X, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  LENDERS,
  Deal,
} from '@/types/deal';
import { mockReferrers } from '@/data/mockDeals';
import { MultiSelectFilter } from './MultiSelectFilter';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealSourcedViaOptions } from '@/hooks/useDealSourcedViaOptions';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useHubSpotOwners, type HubSpotOwner } from '@/hooks/useHubSpot';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const isNumericOwnerId = (value: string) => /^\d+$/.test(value.trim());

const formatHubSpotOwnerName = (owner: HubSpotOwner) => {
  const fullName = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return fullName || owner.email || 'Unknown HubSpot owner';
};

function useDealOwnerOptions(deals: Deal[]) {
  const rawOwners = useMemo(() => {
    const owners = new Set<string>();
    deals.forEach((deal) => {
      if (deal.dealOwner && deal.dealOwner.trim()) {
        owners.add(deal.dealOwner.trim());
      }
    });
    return Array.from(owners);
  }, [deals]);

  const hasHubSpotOwnerIds = useMemo(
    () => rawOwners.some((owner) => isNumericOwnerId(owner)),
    [rawOwners]
  );

  const teamMembers = useTeamMembers();
  const { data: hubSpotOwnersData, isLoading: isLoadingHubSpotOwners } = useHubSpotOwners(100, {
    enabled: hasHubSpotOwnerIds,
  });

  const ownerNameMap = useMemo(() => {
    const map = new Map<string, string>();

    teamMembers.forEach((tm) => {
      map.set(tm.id, tm.display_name);
    });

    (hubSpotOwnersData?.results || []).forEach((owner) => {
      const label = formatHubSpotOwnerName(owner);
      if (owner.id) map.set(String(owner.id), label);
      if (owner.userId !== undefined && owner.userId !== null) {
        map.set(String(owner.userId), label);
      }
      if (owner.email) map.set(owner.email, label);
    });

    return map;
  }, [teamMembers, hubSpotOwnersData]);

  return useMemo(() => {
    return rawOwners
      .map((owner) => {
        const label =
          ownerNameMap.get(owner) ||
          (isNumericOwnerId(owner)
            ? isLoadingHubSpotOwners
              ? 'Resolving owner…'
              : 'Unknown HubSpot owner'
            : owner);

        return { value: owner, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawOwners, ownerNameMap, isLoadingHubSpotOwners]);
}

export type FilterKey = 'stage' | 'status' | 'engagementType' | 'manager' | 'dealOwner' | 'lender' | 'referredBy' | 'sourcedVia';

export const FILTER_LABELS: Record<FilterKey, string> = {
  stage: 'Stage',
  status: 'Status',
  engagementType: 'Engagement',
  manager: 'Manager',
  dealOwner: 'Deal Owner',
  lender: 'Lender',
  referredBy: 'Referred By',
  sourcedVia: 'Sourced via',
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
  const { deals } = useDealsContext();
  const { options: sourcedViaSource } = useDealSourcedViaOptions();
  const dealOwnerOptions = useDealOwnerOptions(deals);

  const stageOptions = Object.entries(STAGE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const statusOptions = [
    ...Object.entries(STATUS_CONFIG).map(([key, { label }]) => ({
      value: key,
      label,
    })),
    { value: '__no_status__', label: 'No status' },
  ];

  const engagementTypeOptions = Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  // Get unique managers from actual deals data
  const managerOptions = useMemo(() => {
    const managers = new Set<string>();
    deals.forEach(deal => {
      if (deal.manager && deal.manager.trim()) {
        managers.add(deal.manager);
      }
    });
    return Array.from(managers).sort().map(manager => ({
      value: manager,
      label: manager,
    }));
  }, [deals]);

  const lenderOptions = LENDERS.map((lender) => ({
    value: lender,
    label: lender,
  }));

  const referredByOptions = mockReferrers.map((referrer) => ({
    value: referrer.id,
    label: referrer.name,
  }));

  const sourcedViaOptions = sourcedViaSource.map((option) => ({
    value: option,
    label: option,
  }));

  const clearAllFilters = () => {
    onFilterChange({
      stage: [],
      status: [],
      engagementType: [],
      manager: [],
      dealOwner: [],
      lender: [],
      referredBy: [],
      sourcedVia: [],
      staleOnly: false,
      flaggedOnly: false,
      hasNotificationsOnly: false,
      tasksFilter: 'all',
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
      key: 'manager', 
      options: managerOptions, 
      onChange: (manager) => onFilterChange({ manager }) 
    },
    {
      key: 'dealOwner',
      options: dealOwnerOptions,
      onChange: (dealOwner) => onFilterChange({ dealOwner }),
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
    {
      key: 'sourcedVia',
      options: sourcedViaOptions,
      onChange: (sourcedVia) => onFilterChange({ sourcedVia }),
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
        className="w-[min(20rem,calc(100vw-2rem))] p-0 bg-popover border border-border shadow-lg max-h-[calc(var(--radix-popover-content-available-height)-16px)] overflow-y-auto overscroll-contain" 
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

          <Separator className="my-3" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Tasks
            </label>
            <Select
              value={filters.tasksFilter ?? 'all'}
              onValueChange={(v) =>
                onFilterChange({
                  tasksFilter: v as FilterType['tasksFilter'],
                })
              }
            >
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deals</SelectItem>
                <SelectItem value="has">Has open tasks</SelectItem>
                <SelectItem value="none">No open tasks</SelectItem>
                <SelectItem value="overdue_only">
                  Only past-due (no current tasks)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export filter configs for use in quick filters
export function useFilterConfigs() {
  const { deals } = useDealsContext();
  const { options: sourcedViaSource } = useDealSourcedViaOptions();
  const dealOwnerOptions = useDealOwnerOptions(deals);

  const stageOptions = Object.entries(STAGE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const statusOptions = [
    ...Object.entries(STATUS_CONFIG).map(([key, { label }]) => ({
      value: key,
      label,
    })),
    { value: '__no_status__', label: 'No status' },
  ];

  const engagementTypeOptions = Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  // Get unique managers from actual deals data
  const managerOptions = useMemo(() => {
    const managers = new Set<string>();
    deals.forEach(deal => {
      if (deal.manager && deal.manager.trim()) {
        managers.add(deal.manager);
      }
    });
    return Array.from(managers).sort().map(manager => ({
      value: manager,
      label: manager,
    }));
  }, [deals]);

  const lenderOptions = LENDERS.map((lender) => ({
    value: lender,
    label: lender,
  }));

  const referredByOptions = mockReferrers.map((referrer) => ({
    value: referrer.id,
    label: referrer.name,
  }));

  const sourcedViaOptions = sourcedViaSource.map((option) => ({
    value: option,
    label: option,
  }));

  return {
    stage: stageOptions,
    status: statusOptions,
    engagementType: engagementTypeOptions,
    manager: managerOptions,
    dealOwner: dealOwnerOptions,
    lender: lenderOptions,
    referredBy: referredByOptions,
    sourcedVia: sourcedViaOptions,
  };
}
