import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DealFilters as FilterType, SortField, SortDirection } from '@/hooks/useDeals';
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
import { MultiSelectFilter } from './MultiSelectFilter';

interface DealFiltersProps {
  filters: FilterType;
  sortField: SortField;
  sortDirection: SortDirection;
  onFilterChange: (filters: Partial<FilterType>) => void;
  onSortChange: (field: SortField) => void;
}

export function DealFilters({
  filters,
  sortField,
  sortDirection,
  onFilterChange,
  onSortChange,
}: DealFiltersProps) {
  const activeFiltersCount = [
    filters.stage.length > 0,
    filters.status.length > 0,
    filters.engagementType.length > 0,
    filters.manager.length > 0,
    filters.lender.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({
      search: '',
      stage: [],
      status: [],
      engagementType: [],
      manager: [],
      lender: [],
    });
  };

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

  const managerOptions = MANAGERS.map((manager) => ({
    value: manager,
    label: manager,
  }));

  const lenderOptions = LENDERS.map((lender) => ({
    value: lender,
    label: lender,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Search */}
        <div className="relative w-full max-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <MultiSelectFilter
            label="Stages"
            options={stageOptions}
            selected={filters.stage}
            onChange={(stage) => onFilterChange({ stage: stage as DealStage[] })}
            className="w-[150px]"
          />

          <MultiSelectFilter
            label="Statuses"
            options={statusOptions}
            selected={filters.status}
            onChange={(status) => onFilterChange({ status: status as DealStatus[] })}
            className="w-[140px]"
          />

          <MultiSelectFilter
            label="Engagement Types"
            options={engagementTypeOptions}
            selected={filters.engagementType}
            onChange={(engagementType) => onFilterChange({ engagementType: engagementType as EngagementType[] })}
            className="w-[170px]"
          />

          <MultiSelectFilter
            label="Managers"
            options={managerOptions}
            selected={filters.manager}
            onChange={(manager) => onFilterChange({ manager })}
            className="w-[150px]"
          />

          <MultiSelectFilter
            label="Lenders"
            options={lenderOptions}
            selected={filters.lender}
            onChange={(lender) => onFilterChange({ lender })}
            className="w-[160px]"
          />

          <Select
            value={`${sortField}-${sortDirection}`}
            onValueChange={(value) => {
              const field = value.split('-')[0] as SortField;
              onSortChange(field);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Recently Updated</SelectItem>
              <SelectItem value="createdAt-desc">Newest First</SelectItem>
              <SelectItem value="value-desc">Highest Value</SelectItem>
              <SelectItem value="value-asc">Lowest Value</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
            </SelectContent>
          </Select>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear ({activeFiltersCount})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
