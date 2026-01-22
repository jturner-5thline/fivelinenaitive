import { useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Building2, Loader2 } from 'lucide-react';
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

// Column definitions matching the Excel screenshot
const COLUMNS = [
  { key: 'name', label: 'Name', width: 180 },
  { key: 'active', label: 'Active', width: 70 },
  { key: 'tier', label: 'Tier', width: 60 },
  { key: 'email', label: 'E-mail', width: 200 },
  { key: 'lender_type', label: 'Lender Type', width: 120 },
  { key: 'loan_types', label: 'Loan Type', width: 150 },
  { key: 'sub_debt', label: 'Sub Debt', width: 80 },
  { key: 'cash_burn', label: 'Cash Burn', width: 90 },
  { key: 'sponsorship', label: 'Sponsorship', width: 100 },
  { key: 'min_revenue', label: 'Min Rev', width: 100 },
  { key: 'ebitda_min', label: 'EBITDA Min', width: 100 },
  { key: 'min_deal', label: 'Min', width: 100 },
  { key: 'max_deal', label: 'Max', width: 100 },
  { key: 'industries', label: 'Deal Industries', width: 200 },
  { key: 'industries_to_avoid', label: 'Industries to Avoid', width: 180 },
  { key: 'b2b_b2c', label: 'B2B / B2C', width: 90 },
  { key: 'refinancing', label: 'Refinancing', width: 100 },
  { key: 'company_requirements', label: 'Company Requirements', width: 200 },
  { key: 'deal_structure_notes', label: 'Deal Structure(s)', width: 180 },
  { key: 'geo', label: 'Geo', width: 150 },
  { key: 'contact_name', label: 'Contact Name', width: 150 },
  { key: 'contact_title', label: 'Contact Title', width: 130 },
  { key: 'relationship_owners', label: 'Relationship Owner(s)', width: 160 },
  { key: 'lender_one_pager_url', label: 'Lender One-pager', width: 150 },
  { key: 'referral_lender', label: 'Referral Lender', width: 130 },
  { key: 'referral_fee_offered', label: 'Referral Fee', width: 110 },
  { key: 'referral_agreement', label: 'Referral Agreement/NDA', width: 170 },
  { key: 'nda', label: 'NDA', width: 80 },
  { key: 'onboarded_to_flex', label: 'Onboarded to FLEx', width: 140 },
  { key: 'external_last_modified', label: 'Last Modified', width: 140 },
  { key: 'created_at', label: 'Created At', width: 140 },
  { key: 'upfront_checklist', label: 'BU/Upfront Checklist', width: 160 },
  { key: 'post_term_sheet_checklist', label: 'Post-Term Sheet Checklist', width: 180 },
  { key: 'gift_address', label: 'Gift Address', width: 250 },
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
                className="flex-shrink-0 px-2 py-2 text-xs font-semibold text-foreground border-r border-border bg-muted truncate"
                style={{ width: col.width }}
                title={col.label}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Data Rows - Virtualized */}
          <Virtuoso
            style={{ height: 'calc(100vh - 320px)' }}
            totalCount={lenders.length}
            endReached={onLoadMore}
            itemContent={(index) => {
              const lender = lenders[index];
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
                      Loading more lenders... ({lenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                    </span>
                  ) : hasMore ? (
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Scroll to load more ({lenders.length.toLocaleString()}{totalCount ? ` / ${totalCount.toLocaleString()}` : ''})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Showing all {lenders.length.toLocaleString()} lenders
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
