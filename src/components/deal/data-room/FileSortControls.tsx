import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type SortField = 'name' | 'date' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';

interface FileSortControlsProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'date', label: 'Date Added' },
  { field: 'size', label: 'File Size' },
  { field: 'type', label: 'File Type' },
];

export function FileSortControls({ sortField, sortDirection, onSort }: FileSortControlsProps) {
  const activeLabel = SORT_OPTIONS.find(o => o.field === sortField)?.label || 'Sort';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
          {sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {activeLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {SORT_OPTIONS.map(opt => (
          <DropdownMenuItem
            key={opt.field}
            onClick={() => onSort(opt.field)}
            className={cn("text-xs", sortField === opt.field && "font-semibold")}
          >
            {opt.label}
            {sortField === opt.field && (
              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-auto" /> : <ArrowDown className="h-3 w-3 ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function sortFiles<T extends { name: string; created_at: string; size_bytes: number }>(
  files: T[],
  field: SortField,
  direction: SortDirection
): T[] {
  const sorted = [...files].sort((a, b) => {
    switch (field) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'date':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'size':
        return a.size_bytes - b.size_bytes;
      case 'type': {
        const extA = a.name.split('.').pop()?.toLowerCase() || '';
        const extB = b.name.split('.').pop()?.toLowerCase() || '';
        return extA.localeCompare(extB);
      }
      default:
        return 0;
    }
  });
  return direction === 'desc' ? sorted.reverse() : sorted;
}
