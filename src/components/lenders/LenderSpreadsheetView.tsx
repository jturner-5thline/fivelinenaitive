import { useState, useMemo, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Building2, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { MasterLender } from '@/hooks/useMasterLenders';

interface LenderSpreadsheetViewProps {
  lenders: MasterLender[];
  activeDealCounts: Record<string, number>;
  loadingMore: boolean;
  hasMore: boolean;
  totalCount: number | null;
  onLoadMore: () => void;
  onRowClick?: (lender: MasterLender) => void;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Column definitions matching the Excel screenshot
const COLUMNS = [
  { key: 'name', label: 'Name', width: 180, sortable: true },
  { key: 'active', label: 'Active', width: 70, sortable: true },
  { key: 'tier', label: 'Tier', width: 60, sortable: true },
  { key: 'email', label: 'E-mail', width: 200, sortable: true },
  { key: 'lender_type', label: 'Lender Type', width: 120, sortable: true },
  { key: 'loan_types', label: 'Loan Type', width: 150, sortable: true },
  { key: 'sub_debt', label: 'Sub Debt', width: 80, sortable: true },
  { key: 'cash_burn', label: 'Cash Burn', width: 90, sortable: true },
  { key: 'sponsorship', label: 'Sponsorship', width: 100, sortable: true },
  { key: 'min_revenue', label: 'Min Rev', width: 100, sortable: true },
  { key: 'ebitda_min', label: 'EBITDA Min', width: 100, sortable: true },
  { key: 'min_deal', label: 'Min', width: 100, sortable: true },
  { key: 'max_deal', label: 'Max', width: 100, sortable: true },
  { key: 'industries', label: 'Deal Industries', width: 200, sortable: true },
  { key: 'industries_to_avoid', label: 'Industries to Avoid', width: 180, sortable: true },
  { key: 'b2b_b2c', label: 'B2B / B2C', width: 90, sortable: true },
  { key: 'refinancing', label: 'Refinancing', width: 100, sortable: true },
  { key: 'company_requirements', label: 'Company Requirements', width: 200, sortable: true },
  { key: 'deal_structure_notes', label: 'Deal Structure(s)', width: 180, sortable: true },
  { key: 'geo', label: 'Geo', width: 150, sortable: true },
  { key: 'contact_name', label: 'Contact Name', width: 150, sortable: true },
  { key: 'contact_title', label: 'Contact Title', width: 130, sortable: true },
  { key: 'relationship_owners', label: 'Relationship Owner(s)', width: 160, sortable: true },
  { key: 'lender_one_pager_url', label: 'Lender One-pager', width: 150, sortable: false },
  { key: 'referral_lender', label: 'Referral Lender', width: 130, sortable: true },
  { key: 'referral_fee_offered', label: 'Referral Fee', width: 110, sortable: true },
  { key: 'referral_agreement', label: 'Referral Agreement/NDA', width: 170, sortable: true },
  { key: 'nda', label: 'NDA', width: 80, sortable: true },
  { key: 'onboarded_to_flex', label: 'Onboarded to FLEx', width: 140, sortable: true },
  { key: 'external_last_modified', label: 'Last Modified', width: 140, sortable: true },
  { key: 'created_at', label: 'Created At', width: 140, sortable: true },
  { key: 'upfront_checklist', label: 'BU/Upfront Checklist', width: 160, sortable: false },
  { key: 'post_term_sheet_checklist', label: 'Post-Term Sheet Checklist', width: 180, sortable: false },
  { key: 'gift_address', label: 'Gift Address', width: 250, sortable: true },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

function formatCellValue(lender: MasterLender, key: ColumnKey): string {
  const value = lender[key as keyof MasterLender];
  
  if (value === null || value === undefined) return '';
  
  // Handle boolean for active status
  if (key === 'active') {
    return value ? 'Yes' : 'No';
  }
  
  // Handle tier display
  if (key === 'tier') {
    return value ? String(value) : '';
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  
  // Handle numbers - format as currency for deal amounts
  if (typeof value === 'number') {
    if (key === 'min_deal' || key === 'max_deal' || key === 'min_revenue' || key === 'ebitda_min') {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value}`;
    }
    return value.toString();
  }
  
  // Handle dates
  if (key === 'created_at' || key === 'external_last_modified') {
    try {
      return new Date(value as string).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  
  return String(value);
}

function getSortValue(lender: MasterLender, key: ColumnKey): string | number | boolean | null {
  const value = lender[key as keyof MasterLender];
  
  if (value === null || value === undefined) return null;
  
  // Handle boolean for active status
  if (key === 'active') {
    return value ? 1 : 0;
  }
  
  // Handle arrays - sort by first element or joined string
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0].toLowerCase() : '';
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    return value;
  }
  
  // Handle dates
  if (key === 'created_at' || key === 'external_last_modified') {
    try {
      return new Date(value as string).getTime();
    } catch {
      return String(value).toLowerCase();
    }
  }
  
  // Handle strings
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  
  return String(value).toLowerCase();
}

// Total width of all columns for the horizontal scroll
const TOTAL_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, 0) + 50; // +50 for row number column

export function LenderSpreadsheetView({
  lenders,
  activeDealCounts,
  loadingMore,
  hasMore,
  totalCount,
  onLoadMore,
  onRowClick,
}: LenderSpreadsheetViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleHeaderClick = (columnKey: string, sortable: boolean) => {
    if (!sortable) return;
    
    setSortState((prev) => {
      if (prev.column === columnKey) {
        // Cycle through: asc -> desc -> null
        if (prev.direction === 'asc') return { column: columnKey, direction: 'desc' };
        if (prev.direction === 'desc') return { column: null, direction: null };
      }
      return { column: columnKey, direction: 'asc' };
    });
  };

  const sortedLenders = useMemo(() => {
    if (!sortState.column || !sortState.direction) return lenders;

    return [...lenders].sort((a, b) => {
      const aVal = getSortValue(a, sortState.column as ColumnKey);
      const bVal = getSortValue(b, sortState.column as ColumnKey);

      // Handle nulls - push to end
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortState.direction === 'desc' ? -comparison : comparison;
    });
  }, [lenders, sortState]);

  const renderSortIcon = (columnKey: string, sortable: boolean) => {
    if (!sortable) return null;
    
    if (sortState.column === columnKey) {
      if (sortState.direction === 'asc') {
        return <ArrowUp className="h-3 w-3 ml-1 text-primary" />;
      }
      if (sortState.direction === 'desc') {
        return <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
      }
    }
    return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
  };

  return (
    <div className="border border-border rounded-md bg-background overflow-hidden">
      <ScrollArea className="w-full" style={{ height: 'calc(100vh - 280px)' }}>
        <div style={{ minWidth: TOTAL_WIDTH }}>
          {/* Header Row */}
          <div className="flex sticky top-0 z-10 bg-muted border-b border-border">
            {/* Row number header */}
            <div className="flex-shrink-0 w-[50px] px-2 py-2 text-xs font-semibold text-muted-foreground border-r border-border bg-muted sticky left-0 z-20">
              #
            </div>
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                className={`flex-shrink-0 px-2 py-2 text-xs font-semibold text-foreground border-r border-border bg-muted flex items-center ${
                  col.sortable ? 'cursor-pointer hover:bg-muted/80 select-none' : ''
                }`}
                style={{ width: col.width }}
                title={col.sortable ? `Click to sort by ${col.label}` : col.label}
                onClick={() => handleHeaderClick(col.key, col.sortable)}
              >
                <span className="truncate">{col.label}</span>
                {renderSortIcon(col.key, col.sortable)}
              </div>
            ))}
          </div>

          {/* Data Rows - Virtualized */}
          <Virtuoso
            style={{ height: 'calc(100vh - 320px)' }}
            totalCount={sortedLenders.length}
            endReached={onLoadMore}
            itemContent={(index) => {
              const lender = sortedLenders[index];
              return (
                <div
                  className="flex border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onRowClick?.(lender)}
                >
                  {/* Row number */}
                  <div className="flex-shrink-0 w-[50px] px-2 py-1.5 text-xs text-muted-foreground border-r border-border/50 bg-muted/30 sticky left-0 z-10">
                    {index + 1}
                  </div>
                  {COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className="flex-shrink-0 px-2 py-1.5 text-xs text-foreground border-r border-border/50 truncate"
                      style={{ width: col.width }}
                      title={formatCellValue(lender, col.key)}
                    >
                      {formatCellValue(lender, col.key)}
                    </div>
                  ))}
                </div>
              );
            }}
            components={{
              Footer: () => (
                <div className="py-4 px-4 text-center text-sm text-muted-foreground border-t border-border/50">
                  {loadingMore ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more lenders... ({sortedLenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                    </span>
                  ) : hasMore ? (
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Scroll to load more ({sortedLenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Showing all {sortedLenders.length.toLocaleString()} lenders
                    </span>
                  )}
                </div>
              ),
            }}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
