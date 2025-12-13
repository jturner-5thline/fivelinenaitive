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
import { DealStatus, STATUS_CONFIG, INDUSTRIES } from '@/types/deal';
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
    filters.status.length > 0,
    filters.industry.length > 0,
    filters.priority.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({
      search: '',
      status: [],
      industry: [],
      priority: [],
    });
  };

  const statusOptions = Object.entries(STATUS_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const industryOptions = INDUSTRIES.map((industry) => ({
    value: industry,
    label: industry,
  }));

  const priorityOptions = [
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Search */}
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search deals, companies, contacts..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <MultiSelectFilter
            label="Statuses"
            options={statusOptions}
            selected={filters.status}
            onChange={(status) => onFilterChange({ status: status as DealStatus[] })}
            className="w-[160px]"
          />

          <MultiSelectFilter
            label="Industries"
            options={industryOptions}
            selected={filters.industry}
            onChange={(industry) => onFilterChange({ industry })}
            className="w-[160px]"
          />

          <MultiSelectFilter
            label="Priorities"
            options={priorityOptions}
            selected={filters.priority}
            onChange={(priority) => onFilterChange({ priority: priority as ('low' | 'medium' | 'high')[] })}
            className="w-[140px]"
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
              <SelectItem value="priority-desc">Highest Priority</SelectItem>
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
