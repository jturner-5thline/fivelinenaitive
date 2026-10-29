import { useState, useMemo, useRef, useLayoutEffect } from 'react';

/** Distance between the fixed floating sidebar's bottom edge and the viewport bottom. */
const SIDEBAR_BOTTOM_GAP = 19;
import { filterToActiveIndustries } from '@/lib/industryOptions';
import { TableVirtuoso, type TableComponents } from 'react-virtuoso';
import { Building2, Loader2, ArrowUp, ArrowDown, ArrowUpDown, ExternalLink } from 'lucide-react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

// Preserve the directory fields while matching the CRM table presentation.
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

type ColumnDef = typeof COLUMNS[number];
const columnWidth = (col: ColumnDef) => Math.max(col.width, col.label.length * 7 + 52);
const DATA_WIDTH = COLUMNS.reduce((sum, col) => sum + columnWidth(col), 0);

function LenderCell({ lender, col }: { lender: MasterLender; col: ColumnDef }) {
  const isCurrency = CURRENCY_COLUMNS.has(col.key);
  const industries = col.key === 'industries' ? filterToActiveIndustries(lender.industries) : [];
  const formatted = col.key === 'industries' ? industries.join(', ') : formatCellValue(lender, col.key);
  const onePager = col.key === 'lender_one_pager_url' && /^https?:\/\//i.test(formatted) ? formatted : null;
  return (
    <TableCell className={cn('text-sm text-muted-foreground', isCurrency && 'text-center tabular-nums', col.key === 'name' && 'font-medium text-foreground')}>
      {industries.length > 0 ? (
        <div className="flex flex-nowrap gap-1 overflow-hidden" title={formatted}>
          {industries.map((industry, i) => <Badge key={`${industry}-${i}`} variant="outline" className="shrink-0 text-[10px] font-medium">{industry}</Badge>)}
        </div>
      ) : col.key === 'email' && formatted ? (
        <a href={`mailto:${formatted}`} onClick={e => e.stopPropagation()} className="block truncate text-primary hover:underline" title={formatted}>{formatted}</a>
      ) : onePager ? (
        <a href={onePager} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1 text-primary hover:underline" title={formatted}>
          <span className="truncate">One-pager</span><ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : <span className="block truncate" title={formatted || undefined}>{formatted || '—'}</span>}
    </TableCell>
  );
}

export function LenderSpreadsheetView({
  lenders,
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

  // Keep row identities stable during sorting and selection to avoid scroll flicker.
  const interactionRef = useRef({ onRowClick, selectedIds });
  interactionRef.current = { onRowClick, selectedIds };
  const tableWidth = DATA_WIDTH + (onToggleSelect ? 40 : 0);
  const components = useMemo<TableComponents<MasterLender>>(() => ({
    // A plain table avoids the second scroll container in the shared Table wrapper.
    Table: ({ style, ...props }) => <table {...props} className="w-full table-fixed caption-bottom text-sm" style={{ ...style, width: tableWidth, minWidth: '100%' }} />,
    TableHead: TableHeader,
    TableBody,
    TableRow: ({ item, context: _context, ...props }) => {
      const activate = () => { if (item) interactionRef.current.onRowClick?.(item); };
      return <TableRow {...props}
        role="button" tabIndex={0} aria-label={item ? `Open ${item.name}` : undefined}
        data-state={item && interactionRef.current.selectedIds?.has(item.id) ? 'selected' : undefined}
        className="cursor-pointer border-0 hover:bg-foreground/[0.025] focus:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
        onClick={e => {
          if ((e.target as HTMLElement).closest('a,button,input,[role="checkbox"]')) return;
          activate();
        }}
        onKeyDown={e => {
          if ((e.target as HTMLElement).closest('a,button,input,[role="checkbox"]')) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        }}
      />;
    },
  }), [tableWidth]);
  const selectedCount = sortedLenders.filter(lender => selectedIds?.has(lender.id)).length;

  // End the table (incl. footer) exactly where the floating sidebar ends:
  // the sidebar is fixed with its bottom 19px above the viewport bottom.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [surfaceHeight, setSurfaceHeight] = useState(480);
  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const update = () => {
      const scroller = el.closest('.main-scrollable');
      const top = el.getBoundingClientRect().top + (scroller?.scrollTop ?? 0);
      setSurfaceHeight(Math.max(280, Math.round(window.innerHeight - SIDEBAR_BOTTOM_GAP - top)));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (el.parentElement) ro?.observe(el.parentElement);
    window.addEventListener('resize', update);
    return () => { ro?.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  return (
    <div ref={surfaceRef} className="crm-companies-surface flex min-h-0 min-w-0 flex-col" style={{ height: surfaceHeight }}>
      <div className="crm-companies-table lender-spreadsheet-table min-h-0 flex-1 overflow-hidden rounded-lg
        [&_table]:border-separate [&_table]:border-spacing-0
        [&_th]:h-10 [&_th]:px-3 [&_th]:py-0 [&_th]:font-medium [&_th]:text-[11px] [&_th]:uppercase [&_th]:text-muted-foreground [&_th]:whitespace-nowrap
        [&_thead]:z-20 [&_thead_th]:border-b [&_thead_th]:border-border/60
        [&_td]:h-11 [&_td]:px-3 [&_td]:py-0 [&_td]:align-middle [&_td]:border-b [&_td]:border-border/25 [&_td]:whitespace-nowrap">
        <TableVirtuoso
          style={{ height: '100%' }}
          data={sortedLenders}
          computeItemKey={(_index, lender) => lender.id}
          components={components}
          endReached={() => { if (hasMore && !loadingMore) onLoadMore(); }}
          increaseViewportBy={{ top: 300, bottom: 300 }}
          fixedHeaderContent={() => (
            <TableRow className="border-0 hover:bg-transparent">
              {onToggleSelect && <TableHead style={{ width: 40 }}>
                <Checkbox aria-label="Select all funding sources"
                  checked={sortedLenders.length > 0 && selectedCount === sortedLenders.length ? true : selectedCount > 0 ? 'indeterminate' : false}
                  onCheckedChange={checked => { if (checked) onSelectAll?.(); else onClearSelection?.(); }} />
              </TableHead>}
              {COLUMNS.map(col => {
                const active = sortState.column === col.key && sortState.direction;
                const Icon = active ? sortState.direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
                return <TableHead key={col.key} style={{ width: columnWidth(col) }} title={col.label} aria-sort={active ? sortState.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
                  {col.sortable ? <Button variant="ghost" size="sm"
                    className={cn('h-auto w-full p-0 text-[11px] font-medium uppercase hover:bg-transparent', CURRENCY_COLUMNS.has(col.key) ? 'justify-center' : 'justify-start')}
                    onClick={() => handleHeaderClick(col.key, true)} aria-label={`Sort by ${col.label}`}>
                    <span className="truncate">{col.label}</span><Icon className={cn('ml-1 h-3 w-3 shrink-0', !active && 'opacity-50')} />
                  </Button> : col.label}
                </TableHead>;
              })}
            </TableRow>
          )}
          itemContent={(_index, lender) => <>
            {onToggleSelect && <TableCell onClick={e => e.stopPropagation()}>
              <Checkbox aria-label={`Select ${lender.name}`} checked={selectedIds?.has(lender.id) ?? false} onCheckedChange={() => onToggleSelect(lender.id)} />
            </TableCell>}
            {COLUMNS.map(col => <LenderCell key={col.key} lender={lender} col={col} />)}
          </>}
          // Keep the wide directory fields in one synchronized horizontal scroller.
          className="w-full"
        />
      </div>
      <div className="shrink-0 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground" role="status">
        <span className="inline-flex items-center gap-2">
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {loadingMore ? 'Loading more lenders…' : hasMore ? 'Scroll to load more' : 'Showing all'}{' '}
          {sortedLenders.length.toLocaleString()} lenders{totalCount && hasMore ? ` / ${totalCount.toLocaleString()}` : ''}
        </span>
      </div>
    </div>
  );
}
