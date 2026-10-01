import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { filterToActiveIndustries, useIndustryOptionsList } from '@/lib/industryOptions';
import { Filter, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MasterLender } from '@/hooks/useMasterLenders';
import { MultiSelectFilter } from '@/components/deals/MultiSelectFilter';
import { 
  AdvancedFilterBuilder, 
  FilterCondition, 
  applyAdvancedFilters,
  parseTypeTags,
  generateId 
} from './AdvancedFilterBuilder';

// Legacy interface for backward compatibility
export interface LenderFilters {
  searchQuery: string;
  dealSize: string;
  minDealSize: string;
  maxDealSize: string;
  minRevenue: string;
  sponsorship: string;
  loanTypes: string[];
  cashBurn: string;
  industries: string[];
  geographies: string[];
  lenderTypes?: string[];
  tiers: string[];
  ndaOnFile?: boolean;
  // New advanced conditions
  advancedConditions: FilterCondition[];
  // Filter mode
  filterMode: 'simple' | 'advanced';
}

const emptyFilters: LenderFilters = {
  searchQuery: '',
  dealSize: '',
  minDealSize: '',
  maxDealSize: '',
  minRevenue: '',
  sponsorship: '',
  loanTypes: [],
  cashBurn: '',
  industries: [],
  geographies: [],
  lenderTypes: [],
  tiers: [],
  advancedConditions: [],
  filterMode: 'simple',
};

interface LenderFiltersProps {
  filters: LenderFilters;
  onFiltersChange: (filters: LenderFilters) => void;
  lenders: MasterLender[];
}

// Debounced input component for search field
function DebouncedInput({ 
  value, 
  onChange, 
  debounceMs = 400,
  ...props 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  debounceMs?: number;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, debounceMs);
  }, [onChange, debounceMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return <Input {...props} value={localValue} onChange={handleChange} />;
}

// Simple filters component (legacy UI)
function SimpleFilters({
  filters,
  onFiltersChange,
  lenders,
}: LenderFiltersProps) {
  // Extract unique values for dropdowns
  const tierOptions = useMemo(() => 
    [{ value: 'T1', label: 'T1' }, { value: 'T2', label: 'T2' }, { value: 'T3', label: 'T3' }],
    []
  );

  const dedupeByLowercase = (values: (string | null | undefined)[]) => {
    const seen = new Map<string, string>();
    for (const raw of values) {
      if (!raw) continue;
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      // Keep the most "title-cased"/longest variant for display
      const existing = seen.get(key);
      if (!existing || raw.length > existing.length) seen.set(key, raw.trim());
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  };

  const loanTypeOptions = useMemo(() =>
    dedupeByLowercase(lenders.flatMap(l => l.loan_types || []))
      .map(v => ({ value: v, label: v })),
    [lenders]
  );

  const lenderTypeOptions = useMemo(() =>
    dedupeByLowercase(lenders.flatMap(l => parseTypeTags(l.lender_type))).map(v => ({ value: v, label: v })),
    [lenders]
  );

  const liveIndustryOptions = useIndustryOptionsList();
  const industryOptions = useMemo(() =>
    filterToActiveIndustries(lenders.flatMap(l => l.industries || []), liveIndustryOptions)
      .map(v => ({ value: v, label: v })),
    [lenders, liveIndustryOptions]
  );

  const geoOptions = useMemo(() => {
    const tags = lenders.flatMap(l =>
      (l.geo || '')
        .split(/[,/;|]| and | & /i)
        .map(t => t.trim())
        .filter(Boolean)
    );
    return dedupeByLowercase(tags).map(v => ({ value: v, label: v }));
  }, [lenders]);

  const sponsorshipOptions = useMemo(() => {
    // Normalize legacy "Not Required" -> "No" and "Required" -> "Yes"; drop them as options
    const normalize = (v: string) => {
      const t = v.trim();
      if (/^not\s*required$/i.test(t)) return 'No';
      if (/^required$/i.test(t)) return 'Yes';
      return t;
    };
    return Array.from(
      new Set(
        lenders
          .map(l => l.sponsorship)
          .filter(Boolean)
          .map(v => normalize(v as string))
      )
    )
      .sort()
      .map(v => ({ value: v, label: v }));
  }, [lenders]);

  const cashBurnOptions = useMemo(() => {
    // Normalize legacy "OK" / "Case by case" variants to "Yes"
    const normalize = (v: string) => {
      const t = v.trim();
      if (/^ok\b/i.test(t)) return 'Yes';
      if (/case\s*[-\s]?by\s*[-\s]?case/i.test(t)) return 'Yes';
      return t;
    };

    return Array.from(
      new Set(
        lenders
          .map(l => l.cash_burn)
          .filter(Boolean)
          .map(v => normalize(v as string))
      )
    )
      .sort()
      .map(v => ({ value: v, label: v }));
  }, [lenders]);

  const sectionCls = "text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
  const fieldLabelCls = "text-xs text-muted-foreground";
  const money = (v: string) => v ? `$${Number(v.replace(/[^0-9]/g, '') || 0).toLocaleString('en-US')}` : '';
  const digits = (v: string) => v.replace(/[^0-9]/g, '');

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 px-3.5 rounded-md border text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border bg-transparent text-foreground/80 hover:bg-muted/40'
      }`}
    >
      {children}
    </button>
  );

  const ChoiceRow = ({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground/90">{label}</span>
      <div className="flex gap-1.5">
        <Pill active={!value} onClick={() => onChange('')}>Any</Pill>
        {options.map((o) => (
          <Pill key={o.value} active={value === o.value} onClick={() => onChange(value === o.value ? '' : o.value)}>{o.label}</Pill>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <div className={sectionCls}>Tier</div>
        <div className="flex gap-1.5">
          {tierOptions.map((t) => {
            const active = filters.tiers.includes(t.value);
            return (
              <Pill
                key={t.value}
                active={active}
                onClick={() => onFiltersChange({
                  ...filters,
                  tiers: active ? filters.tiers.filter((x) => x !== t.value) : [...filters.tiers, t.value],
                })}
              >
                {t.label}
              </Pill>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <div className={sectionCls}>Deal size range</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className={fieldLabelCls}>Min</Label>
            <Input inputMode="numeric" placeholder="e.g. $1,000,000" value={money(filters.minDealSize)}
              onChange={(e) => onFiltersChange({ ...filters, minDealSize: digits(e.target.value), dealSize: '' })}
              className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className={fieldLabelCls}>Max</Label>
            <Input inputMode="numeric" placeholder="e.g. $50,000,000" value={money(filters.maxDealSize)}
              onChange={(e) => onFiltersChange({ ...filters, maxDealSize: digits(e.target.value), dealSize: '' })}
              className="h-9 text-sm" />
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <div className={sectionCls}>Revenue</div>
        <Input inputMode="numeric" placeholder="Company revenue, e.g. $5,000,000" value={money(filters.minRevenue)}
          onChange={(e) => onFiltersChange({ ...filters, minRevenue: digits(e.target.value) })}
          className="h-9 text-sm" />
      </section>

      <section className="space-y-3">
        <div className={sectionCls}>Criteria</div>
        <ChoiceRow label="Sponsorship required" value={filters.sponsorship} options={sponsorshipOptions}
          onChange={(v) => onFiltersChange({ ...filters, sponsorship: v })} />
        <ChoiceRow label="Cash burn OK" value={filters.cashBurn} options={cashBurnOptions}
          onChange={(v) => onFiltersChange({ ...filters, cashBurn: v })} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground/90">NDA on file</span>
          <Pill active={!!filters.ndaOnFile} onClick={() => onFiltersChange({ ...filters, ndaOnFile: !filters.ndaOnFile })}>
            {filters.ndaOnFile ? 'On' : 'Off'}
          </Pill>
        </div>
      </section>

      <section className="space-y-3">
        <div className={sectionCls}>Coverage</div>
        {[
          { label: 'Funding source type', options: lenderTypeOptions, key: 'lenderTypes' as const },
          { label: 'Loan types', options: loanTypeOptions, key: 'loanTypes' as const },
          { label: 'Industries', options: industryOptions, key: 'industries' as const },
          { label: 'Geography', options: geoOptions, key: 'geographies' as const },
        ].map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className={fieldLabelCls}>{f.label}</Label>
            <MultiSelectFilter
              label="Any"
              options={f.options}
              selected={filters[f.key] || []}
              onChange={(selected) => onFiltersChange({ ...filters, [f.key]: selected })}
              className="w-full h-9 text-sm justify-between"
            />
          </div>
        ))}
      </section>
    </div>
  );
}

export function LenderFiltersPanel({ filters, onFiltersChange, lenders }: LenderFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <LenderFiltersPanelInner
      filters={filters}
      onFiltersChange={onFiltersChange}
      lenders={lenders}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    />
  );
}

/**
 * Body-only variant — renders just the filter controls (no collapsible
 * chrome, no outer border). Use this when embedding filters inside a
 * Popover / Sheet trigger from the parent toolbar.
 */
export function LenderFiltersBody({ filters, onFiltersChange, lenders }: LenderFiltersProps) {
  return (
    <LenderFiltersPanelInner
      filters={filters}
      onFiltersChange={onFiltersChange}
      lenders={lenders}
      isOpen={true}
      setIsOpen={() => {}}
      bodyOnly
    />
  );
}

interface LenderFiltersInnerProps extends LenderFiltersProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  bodyOnly?: boolean;
}

export function countActiveLenderFilters(filters: LenderFilters): number {
  const filterMode = filters.filterMode || 'simple';
  let count = 0;
  if (filters.searchQuery) count++;
  if (filterMode === 'advanced') {
    count += (filters.advancedConditions || []).length;
  } else {
    if (filters.tiers?.length) count++;
    if (filters.dealSize) count++;
    if (filters.minDealSize) count++;
    if (filters.maxDealSize) count++;
    if (filters.minRevenue) count++;
    if (filters.loanTypes?.length) count++;
    if (filters.industries?.length) count++;
    if (filters.geographies?.length) count++;
    if (filters.lenderTypes?.length) count++;
    if (filters.sponsorship) count++;
    if (filters.cashBurn) count++;
    if (filters.ndaOnFile) count++;
  }
  return count;
}

function LenderFiltersPanelInner({ filters, onFiltersChange, lenders, isOpen, setIsOpen, bodyOnly }: LenderFiltersInnerProps) {
  
  // Ensure filterMode has a default
  const filterMode = filters.filterMode || 'simple';

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery) count++;
    
    if (filterMode === 'advanced') {
      count += (filters.advancedConditions || []).length;
    } else {
      // Count simple filters
      if (filters.tiers?.length) count++;
      if (filters.dealSize) count++;
      if (filters.minDealSize) count++;
      if (filters.maxDealSize) count++;
      if (filters.minRevenue) count++;
      if (filters.loanTypes?.length) count++;
      if (filters.industries?.length) count++;
      if (filters.geographies?.length) count++;
      if (filters.lenderTypes?.length) count++;
      if (filters.sponsorship) count++;
      if (filters.cashBurn) count++;
      if (filters.ndaOnFile) count++;
    }
    return count;
  }, [filters, filterMode]);

  const handleClearAll = useCallback(() => {
    onFiltersChange({ ...emptyFilters, filterMode });
  }, [onFiltersChange, filterMode]);

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, searchQuery: value });
  }, [filters, onFiltersChange]);

  const handleConditionsChange = useCallback((conditions: FilterCondition[]) => {
    onFiltersChange({ ...filters, advancedConditions: conditions });
  }, [filters, onFiltersChange]);

  const handleModeChange = useCallback((mode: string) => {
    onFiltersChange({ ...filters, filterMode: mode as 'simple' | 'advanced' });
  }, [filters, onFiltersChange]);

  const clearSearch = useCallback(() => {
    onFiltersChange({ ...filters, searchQuery: '' });
  }, [filters, onFiltersChange]);

  // Summarize conditions for display (advanced mode)
  const conditionSummaries = useMemo(() => {
    return (filters.advancedConditions || []).map((c) => {
      const fieldLabel = c.field.replace(/_/g, ' ');
      let valueStr = '';
      if (typeof c.value === 'boolean') {
        valueStr = c.value ? '✓' : '✗';
      } else if (Array.isArray(c.value)) {
        valueStr = c.value.length > 2 
          ? `${c.value.length} selected` 
          : c.value.join(', ');
      } else {
        valueStr = String(c.value || '');
      }
      return { id: c.id, summary: `${fieldLabel} ${c.operator.replace(/_/g, ' ')} ${valueStr}` };
    });
  }, [filters.advancedConditions]);

  // Summarize simple filters for display
  const simpleFilterSummaries = useMemo(() => {
    const summaries: { key: string; label: string }[] = [];
    if (filters.tiers?.length) summaries.push({ key: 'tiers', label: `Tier: ${filters.tiers.join(', ')}` });
    if (filters.dealSize) summaries.push({ key: 'dealSize', label: `Deal Size: $${Number(filters.dealSize).toLocaleString('en-US')}` });
    if (filters.minDealSize) summaries.push({ key: 'minDeal', label: `Min Deal: $${Number(filters.minDealSize).toLocaleString('en-US')}` });
    if (filters.maxDealSize) summaries.push({ key: 'maxDeal', label: `Max Deal: $${Number(filters.maxDealSize).toLocaleString('en-US')}` });
    if (filters.minRevenue) summaries.push({ key: 'minRev', label: `Min Revenue: $${Number(filters.minRevenue).toLocaleString('en-US')}` });
    if (filters.loanTypes?.length) summaries.push({ key: 'loans', label: `Loans: ${filters.loanTypes.length > 2 ? `${filters.loanTypes.length} types` : filters.loanTypes.join(', ')}` });
    if (filters.industries?.length) summaries.push({ key: 'industries', label: `Industries: ${filters.industries.length > 2 ? `${filters.industries.length} selected` : filters.industries.join(', ')}` });
    if (filters.geographies?.length) summaries.push({ key: 'geo', label: `Geo: ${filters.geographies.length > 2 ? `${filters.geographies.length} selected` : filters.geographies.join(', ')}` });
    if (filters.sponsorship) summaries.push({ key: 'sponsor', label: `Sponsorship Required?: ${filters.sponsorship}` });
    if (filters.cashBurn) summaries.push({ key: 'cashBurn', label: `Cash Burn: ${filters.cashBurn}` });
    if (filters.ndaOnFile) summaries.push({ key: 'nda', label: 'NDA on file' });
    return summaries;
  }, [filters]);

  const body = (
    <div className={bodyOnly ? '' : 'px-3 pb-3 space-y-3'}>
      {bodyOnly && (
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-muted-foreground">
            {filterMode === 'simple' ? 'Quick filters' : 'Custom rule builder'}
          </span>
          <Tabs value={filterMode} onValueChange={handleModeChange}>
            <TabsList className="h-7">
              <TabsTrigger value="simple" className="text-[11px] px-2.5 h-6">Simple</TabsTrigger>
              <TabsTrigger value="advanced" className="text-[11px] px-2.5 h-6">Advanced</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {filters.searchQuery && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Search: "{filters.searchQuery}"
              <button
                type="button"
                onClick={clearSearch}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filterMode === 'advanced' && conditionSummaries.map(({ id, summary }) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1 max-w-[200px] truncate">
              {summary}
              <button
                type="button"
                onClick={() => {
                  handleConditionsChange(
                    (filters.advancedConditions || []).filter((c) => c.id !== id)
                  );
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filterMode === 'simple' && simpleFilterSummaries.map(({ key, label }) => (
            <Badge key={key} variant="secondary" className="gap-1 max-w-[200px] truncate">
              {label}
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-6 text-xs">Clear All</Button>
        </div>
      )}

      {filterMode === 'simple' ? (
        <SimpleFilters filters={filters} onFiltersChange={onFiltersChange} lenders={lenders} />
      ) : (
        <AdvancedFilterBuilder
          conditions={filters.advancedConditions || []}
          onConditionsChange={handleConditionsChange}
          lenders={lenders}
        />
      )}
    </div>
  );

  if (bodyOnly) return body;

  return (
    <div className="border border-white/10 rounded-lg bg-transparent">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between p-2 pl-3 gap-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 transition-colors"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
              {isOpen ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
            </button>
          </CollapsibleTrigger>
          {isOpen && (
            <Tabs value={filterMode} onValueChange={handleModeChange}>
              <TabsList className="h-7">
                <TabsTrigger value="simple" className="text-[11px] px-2.5 h-6">Simple</TabsTrigger>
                <TabsTrigger value="advanced" className="text-[11px] px-2.5 h-6">Advanced</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        <CollapsibleContent>{body}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Filter function to apply all filters to lenders
export function applyLenderFilters(lenders: MasterLender[], filters: LenderFilters): MasterLender[] {
  let result = lenders;

  // Ensure filters has required properties with fallbacks
  const safeFilters = {
    ...emptyFilters,
    ...filters,
  };

  const filterMode = safeFilters.filterMode || 'simple';

  // Apply search query filter first
  if (safeFilters.searchQuery) {
    const query = safeFilters.searchQuery.toLowerCase();
    result = result.filter((lender) => {
      const nameMatch = lender.name?.toLowerCase().includes(query);
      const contactMatch = lender.contact_name?.toLowerCase().includes(query);
      return nameMatch || contactMatch;
    });
  }

  if (filterMode === 'advanced') {
    // Apply advanced conditions
    if (safeFilters.advancedConditions && safeFilters.advancedConditions.length > 0) {
      result = applyAdvancedFilters(result, safeFilters.advancedConditions);
    }
  } else {
    // Apply simple filters
    
    // Tier filter
    if (safeFilters.tiers && safeFilters.tiers.length > 0) {
      result = result.filter((lender) => 
        safeFilters.tiers.some(tier => lender.tier === tier)
      );
    }

    // Deal Size: show lenders whose range covers this deal size
    if (safeFilters.dealSize) {
      const size = parseFloat(safeFilters.dealSize);
      if (!isNaN(size)) {
        result = result.filter((lender) => {
          // Both bounds must be known and cover the requested size:
          // min_deal <= size <= max_deal.
          if (lender.min_deal == null || lender.max_deal == null) return false;
          return lender.min_deal <= size && lender.max_deal >= size;
        });
      }
    }

    // Min Deal Size: show lenders whose minimum deal size is <= this value
    // (i.e., they will consider deals at least this small)
    if (safeFilters.minDealSize) {
      const minDeal = parseFloat(safeFilters.minDealSize);
      if (!isNaN(minDeal)) {
        result = result.filter((lender) =>
          lender.min_deal == null || lender.min_deal <= minDeal
        );
      }
    }

    // Max Deal Size: show lenders whose maximum deal size is >= this value
    // (i.e., they can go at least this large)
    if (safeFilters.maxDealSize) {
      const maxDeal = parseFloat(safeFilters.maxDealSize);
      if (!isNaN(maxDeal)) {
        result = result.filter((lender) =>
          lender.max_deal == null || lender.max_deal >= maxDeal
        );
      }
    }

    // Min revenue
    if (safeFilters.minRevenue) {
      const minRev = parseFloat(safeFilters.minRevenue);
      result = result.filter((lender) => 
        lender.min_revenue == null || lender.min_revenue >= minRev
      );
    }

    // Loan types
    if (safeFilters.loanTypes && safeFilters.loanTypes.length > 0) {
      result = result.filter((lender) => 
        lender.loan_types?.some(lt => safeFilters.loanTypes.includes(lt))
      );
    }

    // Industries
    if (safeFilters.industries && safeFilters.industries.length > 0) {
      result = result.filter((lender) => 
        lender.industries?.some(ind => safeFilters.industries.includes(ind))
      );
    }

    // Geographies (match any selected tag against lender's geo string)
    if (safeFilters.lenderTypes && safeFilters.lenderTypes.length > 0) {
      const sel = new Set(safeFilters.lenderTypes.map(t => t.toLowerCase()));
      result = result.filter((l) => parseTypeTags(l.lender_type).some(t => sel.has(t.toLowerCase())));
    }

    if (safeFilters.geographies && safeFilters.geographies.length > 0) {
      const selected = safeFilters.geographies.map(g => g.toLowerCase());
      result = result.filter((lender) => {
        const tags = (lender.geo || '')
          .split(/[,/;|]| and | & /i)
          .map(t => t.trim().toLowerCase())
          .filter(Boolean);
        return tags.some(t => selected.includes(t));
      });
    }

    // Sponsorship
    if (safeFilters.sponsorship) {
      result = result.filter((lender) => 
        lender.sponsorship === safeFilters.sponsorship
      );
    }

    // Cash burn
    if (safeFilters.cashBurn) {
      result = result.filter((lender) => 
        lender.cash_burn === safeFilters.cashBurn
      );
    }

    // NDA on file — free-text NDA field set to anything other than an explicit "no"
    if (safeFilters.ndaOnFile) {
      const NO = ['no', 'n', 'false', 'none', 'not signed', 'no nda'];
      result = result.filter((lender) => {
        const v = String((lender as any).nda || '').trim().toLowerCase();
        return !!v && !NO.includes(v);
      });
    }
  }

  return result;
}

export { emptyFilters, generateId };
export type { FilterCondition };

