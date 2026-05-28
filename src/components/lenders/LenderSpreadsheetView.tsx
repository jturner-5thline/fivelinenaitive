import { useState, useMemo, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Building2, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { MasterLender } from '@/hooks/useMasterLenders';

interface LenderSpreadsheetViewProps {
  lenders: MasterLender[];
  activeDealCounts: Record<string, number>;
  loadingMore: boolean;
  hasMore: boolean;
  totalCount: number | null;
  onLoadMore: () => void;
  onRowClick?: (lender: MasterLender) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (lenderId: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Column definitions matching the Excel screenshot
const COLUMNS = [
  { key: 'name', label: 'Name', width: 200, sortable: true },
  { key: 'active', label: 'Active', width: 90, sortable: true },
  { key: 'tier', label: 'Tier', width: 80, sortable: true },
  { key: 'email', label: 'E-mail', width: 220, sortable: true },
  { key: 'lender_type', label: 'Funding Source', width: 170, sortable: true },
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

// Monetary columns — values rendered center-aligned (header + cell)
const CURRENCY_COLUMNS: ReadonlySet<string> = new Set([
  'min_revenue',
  'ebitda_min',
  'min_deal',
  'max_deal',
  'referral_fee_offered',
]);

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
      if (value >= 1000000000) return `$${(value / 1000000000).toFixed(value % 1000000000 === 0 ? 0 : 1)}B`;
      if (value >= 1000000) return `$${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}MM`;
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

// Total width of all columns for the horizontal scroll (add 40 for checkbox column)
const TOTAL_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, 0) + 50 + 40; // +50 for row number, +40 for checkbox

type ColumnDef = typeof COLUMNS[number];

function LenderCell({ lender, col }: { lender: MasterLender; col: ColumnDef }) {
  const isCurrency = CURRENCY_COLUMNS.has(col.key);
  const isIndustries = col.key === 'industries';
  const rawValue = lender[col.key as keyof MasterLender];
  const formatted = formatCellValue(lender, col.key);

  // Tag/chip rendering for Deal Industries
  if (isIndustries && Array.isArray(rawValue) && rawValue.length > 0) {
    return (
      <div
        className="flex-shrink-0 px-3 py-2 border-r border-white/[0.04] flex items-center gap-1 overflow-hidden"
        style={{ width: col.width }}
        title={rawValue.join(', ')}
      >
        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
          {rawValue.map((industry, i) => (
            <span
              key={`${industry}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium text-foreground/80 bg-white/[0.05] border border-white/10 whitespace-nowrap shrink-0"
            >
              {industry}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-shrink-0 px-3 py-2 text-xs border-r border-white/[0.04] truncate flex items-center ${
        isCurrency ? 'justify-center tabular-nums' : ''
      } ${
        col.key === 'name' ? 'text-foreground font-medium' : 'text-foreground/75'
      }`}
      style={{ width: col.width }}
      title={formatted}
    >
      {formatted || <span className="text-muted-foreground/30">—</span>}
    </div>
  );
}

export function LenderSpreadsheetView({
  lenders,
  activeDealCounts,
  loadingMore,
  hasMore,
  totalCount,
  onLoadMore,
  onRowClick,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
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
        return <ArrowUp className="h-3 w-3 ml-1 text-[hsl(292,46%,72%)]" />;
      }
      if (sortState.direction === 'desc') {
        return <ArrowDown className="h-3 w-3 ml-1 text-[hsl(292,46%,72%)]" />;
      }
    }
    return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/30 group-hover:text-muted-foreground/60" />;
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
      {/*
        Bug fix (scroll glitch): previously this view nested a Virtuoso
        virtualized list inside a Radix `ScrollArea`. The outer ScrollArea
        tried to scroll vertically at the same time Virtuoso did, which
        produced flickering and row-jumping during scroll. We now use a
        single horizontally-scrolling container and let Virtuoso own the
        vertical scroll. `backdrop-blur` on sticky row cells is also
        removed — recompositing the blur per scroll frame is a known
        perf/flicker hazard.
      */}
      <div className="w-full overflow-x-auto" style={{ height: 'calc(100vh - 280px)' }}>
        <div style={{ minWidth: TOTAL_WIDTH, height: '100%' }} className="flex flex-col">
          {/* Header Row */}
          <div className="flex sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-white/10">
            {/* Checkbox header */}
            {onToggleSelect && (
              <div className="flex-shrink-0 w-[40px] px-2 py-2.5 border-r border-white/5 bg-white/[0.04] sticky left-0 z-20 flex items-center justify-center">
                <Checkbox
                  checked={selectedIds && selectedIds.size === lenders.length && lenders.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onSelectAll?.();
                    } else {
                      onClearSelection?.();
                    }
                  }}
                />
              </div>
            )}
            {/* Row number header */}
            <div className={`flex-shrink-0 w-[50px] px-2 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 border-r border-white/5 bg-white/[0.04] ${onToggleSelect ? '' : 'sticky left-0'} z-20`}>
              #
            </div>
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                className={`flex-shrink-0 px-3 py-2.5 text-[11px] font-medium tracking-normal text-muted-foreground border-r border-white/5 bg-white/[0.04] flex items-center transition-colors ${
                  CURRENCY_COLUMNS.has(col.key) ? 'justify-center' : ''
                } ${
                  col.sortable ? 'cursor-pointer hover:text-foreground hover:bg-white/[0.06] select-none' : ''
                } ${col.key === 'name' ? 'text-foreground/90' : ''}`}
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
            style={{ flex: 1, minHeight: 0, contain: 'strict', willChange: 'transform' }}
            totalCount={sortedLenders.length}
            endReached={onLoadMore}
            increaseViewportBy={{ top: 1200, bottom: 1200 }}
            computeItemKey={(index) => sortedLenders[index]?.id ?? index}
            itemContent={(index) => {
              const lender = sortedLenders[index];
              const isSelected = selectedIds?.has(lender.id) ?? false;
              return (
                <div
                  className={`flex h-9 border-b border-white/[0.04] cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? 'bg-[hsl(272,100%,70%)]/[0.08] hover:bg-[hsl(272,100%,70%)]/[0.12]'
                      : 'hover:bg-white/[0.03]'
                  }`}
                  onClick={() => onRowClick?.(lender)}
                >
                  {/* Checkbox */}
                  {onToggleSelect && (
                    <div 
                      className="flex-shrink-0 w-[40px] px-2 py-2 border-r border-white/[0.04] bg-[hsl(var(--background))] sticky left-0 z-10 flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect!(lender.id)}
                      />
                    </div>
                  )}
                  {/* Row number */}
                  <div className={`flex-shrink-0 w-[50px] px-2 py-2 text-xs text-muted-foreground/60 border-r border-white/[0.04] bg-[hsl(var(--background))] flex items-center ${onToggleSelect ? '' : 'sticky left-0'} z-10`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {index + 1}
                  </div>
                  {COLUMNS.map((col) => (
                    <LenderCell key={col.key} lender={lender} col={col} />
                  ))}
                </div>
              );
            }}
            components={{
              Footer: () => (
                <div className="py-4 px-4 text-center text-xs text-muted-foreground/70 border-t border-white/[0.05] bg-white/[0.02]">
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
      </div>
    </div>
  );
}
