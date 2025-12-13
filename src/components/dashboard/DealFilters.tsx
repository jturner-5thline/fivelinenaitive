import { Search, Filter, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

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
    filters.status !== 'all',
    filters.industry !== 'all',
    filters.priority !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({
      search: '',
      status: 'all',
      industry: 'all',
      priority: 'all',
    });
  };

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
          <Select
            value={filters.status}
            onValueChange={(value) => onFilterChange({ status: value as DealStatus | 'all' })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.industry}
            onValueChange={(value) => onFilterChange({ industry: value })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {INDUSTRIES.map((industry) => (
                <SelectItem key={industry} value={industry}>
                  {industry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.priority}
            onValueChange={(value) =>
              onFilterChange({ priority: value as 'low' | 'medium' | 'high' | 'all' })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

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
