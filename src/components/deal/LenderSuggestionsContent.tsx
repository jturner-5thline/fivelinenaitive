import { useState, useMemo, useCallback } from 'react';
import { dealTypeIdsToLabels } from '@/utils/dealTypeLabels';
import { ChevronDown, Plus, Search, Building2, MapPin, DollarSign, AlertTriangle, CheckCircle2, Info, Filter, X, CheckSquare, Brain, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMasterLenders, MasterLender } from '@/hooks/useMasterLenders';
import { useLenderMatching, LenderMatch, DealCriteria } from '@/hooks/useLenderMatching';
import { countCriteriaMatches, dealCriteriaToFilterInput, DealFilterInput } from '@/utils/lenderEligibilityFilter';
import { LenderWarningBadge } from './LenderWarningBadge';
import { LenderDetailDialog, LenderEditData } from '@/components/lenders/LenderDetailDialog';
import { MasterLenderInsert } from '@/hooks/useMasterLenders';
import { toast } from 'sonner';

interface LenderSuggestionsContentProps {
  criteria: DealCriteria;
  existingLenderNames: string[];
  onAddLender: (lenderName: string) => void;
  onAddMultipleLenders?: (lenderNames: string[]) => void;
}

export function LenderSuggestionsContent({
  criteria,
  existingLenderNames,
  onAddLender,
  onAddMultipleLenders,
}: LenderSuggestionsContentProps) {
  const { lenders: masterLenders, loading, updateLender } = useMasterLenders();
  const [searchQuery, setSearchQuery] = useState('');
  const [lenderTypeFilter, setLenderTypeFilter] = useState<string>('all');
  const [showOnlyHighScore, setShowOnlyHighScore] = useState(false);
  const [selectedLenders, setSelectedLenders] = useState<Set<string>>(new Set());
  const [tierFilters, setTierFilters] = useState<Set<string>>(new Set(['T1', 'T2', 'T3']));
  const [showLearningWarnings, setShowLearningWarnings] = useState(true);
  const [detailLender, setDetailLender] = useState<MasterLender | null>(null);

  const detailLenderInfo = useMemo(() => {
    if (!detailLender) return null;
    return {
      id: detailLender.id,
      name: detailLender.name,
      contact: {
        name: detailLender.contact_name || '',
        title: '',
        email: detailLender.email || '',
        phone: '',
      },
      preferences: [],
      website: undefined,
      description: undefined,
      lenderType: detailLender.lender_type || undefined,
      minDeal: detailLender.min_deal,
      maxDeal: detailLender.max_deal,
      geo: detailLender.geo,
      industries: detailLender.industries,
      loanTypes: detailLender.loan_types,
      minRevenue: detailLender.min_revenue,
      ebitdaMin: detailLender.ebitda_min,
      companyRequirements: detailLender.company_requirements,
      tier: detailLender.tier,
    };
  }, [detailLender]);
  
  const { matches, learningEnabled } = useLenderMatching(masterLenders, criteria, {
    minScore: -10,
    maxResults: 100,
    excludeNames: existingLenderNames,
    enableLearning: true,
  });

  const dealFilterInput = useMemo(() => dealCriteriaToFilterInput(criteria), [criteria]);

  const existingNamesSet = useMemo(() => 
    new Set(existingLenderNames.map(n => n.toLowerCase().trim())), 
    [existingLenderNames]
  );
  // Get unique lender types for filter
  const lenderTypes = useMemo(() => {
    const types = new Set<string>();
    matches.forEach(m => {
      if (m.lender.lender_type) {
        types.add(m.lender.lender_type);
      }
    });
    return Array.from(types).sort();
  }, [matches]);
  
  // Filter matches based on search and filters
  const filteredMatches = useMemo(() => {
    let filtered = matches;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.lender.name.toLowerCase().includes(query) ||
        m.lender.lender_type?.toLowerCase().includes(query) ||
        m.lender.loan_types?.some(lt => lt.toLowerCase().includes(query)) ||
        m.lender.industries?.some(i => i.toLowerCase().includes(query))
      );
    }
    
    if (lenderTypeFilter !== 'all') {
      filtered = filtered.filter(m => m.lender.lender_type === lenderTypeFilter);
    }
    
    if (showOnlyHighScore) {
      filtered = filtered.filter(m => m.score >= 25);
    }
    
    if (tierFilters.size > 0) {
      filtered = filtered.filter(m => {
        const tier = m.lender.tier?.toUpperCase();
        if (tier && ['T1', 'T2', 'T3'].includes(tier)) {
          return tierFilters.has(tier);
        }
        // Untiered lenders only shown if '?' filter is active
        return tierFilters.has('?');
      });
    }
    
    return filtered;
  }, [matches, searchQuery, lenderTypeFilter, showOnlyHighScore, tierFilters]);
  
  // Group by tier
  const groupedByTier = useMemo(() => {
    const t1: LenderMatch[] = [];
    const t2: LenderMatch[] = [];
    const t3: LenderMatch[] = [];
    const other: LenderMatch[] = [];
    
    filteredMatches.forEach(match => {
      const tier = match.lender.tier?.toUpperCase();
      if (tier === 'T1') {
        t1.push(match);
      } else if (tier === 'T2') {
        t2.push(match);
      } else if (tier === 'T3') {
        t3.push(match);
      } else {
        other.push(match);
      }
    });
    
    // Sort each tier by score descending
    t1.sort((a, b) => b.score - a.score);
    t2.sort((a, b) => b.score - a.score);
    t3.sort((a, b) => b.score - a.score);
    other.sort((a, b) => b.score - a.score);
    
    return { t1, t2, t3, other };
  }, [filteredMatches]);

  // Determine which tier columns to show
  const visibleTierColumns = useMemo(() => {
    const cols: { key: string; label: string; matches: typeof groupedByTier.t1; colorClass: string }[] = [];
    if (groupedByTier.t1.length > 0) cols.push({ key: 'T1', label: 'Tier 1', matches: groupedByTier.t1, colorClass: 'bg-[#d1fae5] text-[#047857]' });
    if (groupedByTier.t2.length > 0) cols.push({ key: 'T2', label: 'Tier 2', matches: groupedByTier.t2, colorClass: 'bg-[#d0e7ff] text-[#1d4ed8]' });
    if (groupedByTier.t3.length > 0) cols.push({ key: 'T3', label: 'Tier 3', matches: groupedByTier.t3, colorClass: 'bg-[#fef3c7] text-[#b45309]' });
    return cols;
  }, [groupedByTier]);

  // When only 1 tier column, render lenders as a flat grid (3 across) instead of a single tier column
  const singleTierFlat = visibleTierColumns.length === 1;

  const gridColsClass = useMemo(() => {
    const count = visibleTierColumns.length;
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    return 'grid-cols-1 md:grid-cols-3';
  }, [visibleTierColumns]);
  
  const totalMatches = groupedByTier.t1.length + groupedByTier.t2.length + groupedByTier.t3.length + groupedByTier.other.length;

  const handleToggleLender = (lenderId: string) => {
    setSelectedLenders(prev => {
      const next = new Set(prev);
      if (next.has(lenderId)) {
        next.delete(lenderId);
      } else {
        next.add(lenderId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = filteredMatches
      .filter(m => !existingNamesSet.has(m.lender.name.toLowerCase().trim()))
      .map(m => m.lender.id);
    setSelectedLenders(new Set(allIds));
  };

  const handleClearSelection = () => {
    setSelectedLenders(new Set());
  };

  const handleAddSelected = () => {
    const selectedNames = filteredMatches
      .filter(m => selectedLenders.has(m.lender.id) && !existingNamesSet.has(m.lender.name.toLowerCase().trim()))
      .map(m => m.lender.name);
    
    if (onAddMultipleLenders) {
      onAddMultipleLenders(selectedNames);
    } else {
      selectedNames.forEach(name => onAddLender(name));
    }
    setSelectedLenders(new Set());
  };
  
  const isReady = !loading && masterLenders.length > 0 && matches.length > 0;
  
  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading lender database...' : masterLenders.length === 0 ? 'Loading lender database...' : 'Analyzing matches...'}
        </span>
      </div>
    );
  }
  
  // Format deal size for display (abbreviated: $10MM)
  const formatDealSize = (value: number | undefined, capitalAsk: string | undefined): string | null => {
    if (capitalAsk) return capitalAsk;
    if (!value) return null;
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}MM`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  const dealSizeDisplay = formatDealSize(criteria.dealValue, criteria.capitalAsk);

  return (
    <div className="flex flex-col h-full py-4">
      {/* Criteria Summary */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">Matching criteria (priority order):</p>
        <div className="flex flex-wrap gap-1.5">
          {dealSizeDisplay && (
            <Badge className="text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
              <DollarSign className="h-3 w-3 mr-1" />
              Deal Size: {dealSizeDisplay}
            </Badge>
          )}
          {criteria.dealTypes && criteria.dealTypes.length > 0 && (
            <Badge className="text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              Type: {dealTypeIdsToLabels(criteria.dealTypes.slice(0, 2)).join(', ')}
              {criteria.dealTypes.length > 2 && ` +${criteria.dealTypes.length - 2}`}
            </Badge>
          )}
          {criteria.cashBurnOk !== undefined && (
            <Badge className="text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
              Cash Burn: {criteria.cashBurnOk ? 'OK' : 'No'}
            </Badge>
          )}
          {criteria.industry && (
            <Badge className="text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800">
              <Building2 className="h-3 w-3 mr-1" />
              {criteria.industry}
            </Badge>
          )}
          {criteria.sponsorship && (
            <Badge className="text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800">
              Sponsorship: {criteria.sponsorship}
            </Badge>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-2 mb-4 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lenders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        <Select value={lenderTypeFilter} onValueChange={setLenderTypeFilter}>
          <SelectTrigger className="h-8 text-xs w-[130px] shrink-0">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Lender Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {lenderTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          variant={showOnlyHighScore ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs shrink-0 whitespace-nowrap"
          onClick={() => setShowOnlyHighScore(!showOnlyHighScore)}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Top Matches
        </Button>
      </div>
      
      {/* Learning Toggle */}
      {learningEnabled && (
        <div className="flex items-center gap-2 text-xs mb-4">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <Label htmlFor="show-warnings" className="text-xs font-normal cursor-pointer">
            Show learning insights
          </Label>
          <Switch
            id="show-warnings"
            checked={showLearningWarnings}
            onCheckedChange={setShowLearningWarnings}
            className="scale-75"
          />
        </div>
      )}

      {/* Selection Actions Bar */}
      {selectedLenders.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-primary/10 rounded-lg border border-primary/20">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium flex-1">
            {selectedLenders.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleClearSelection}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddSelected}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Selected
          </Button>
        </div>
      )}

      {/* Select All / Tier Filters */}
      {totalMatches > 0 && selectedLenders.size === 0 && (
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSelectAll}
          >
            <CheckSquare className="h-3 w-3 mr-1" />
            Select All ({totalMatches})
          </Button>
          <div className="h-4 w-px bg-border" />
          {(['T1', 'T2', 'T3', '?'] as const).map((tier) => (
            <Button
              key={tier}
              variant={tierFilters.has(tier) ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => {
                setTierFilters(prev => {
                  const next = new Set(prev);
                  if (next.has(tier)) {
                    next.delete(tier);
                  } else {
                    next.add(tier);
                  }
                  return next;
                });
              }}
              title={tier === '?' ? 'Show untiered lenders' : `Filter by ${tier}`}
            >
              {tier}
            </Button>
          ))}
        </div>
      )}
      
      <ScrollArea className="flex-1 -mx-6 px-6">
        {totalMatches === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No matching lenders found. Try adjusting the deal criteria or filters.
          </div>
        ) : singleTierFlat ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className={visibleTierColumns[0].colorClass}>{visibleTierColumns[0].label}</Badge>
              <span className="text-xs text-muted-foreground">({visibleTierColumns[0].matches.length} lenders)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pb-4">
              {visibleTierColumns[0].matches.map(match => (
                <LenderMatchCard
                  key={match.lender.id}
                  match={match}
                  isSelected={selectedLenders.has(match.lender.id)}
                  onToggle={() => handleToggleLender(match.lender.id)}
                  onAdd={() => onAddLender(match.lender.name)}
                  onViewDetail={() => setDetailLender(match.lender)}
                  badgeVariant="secondary"
                  compact
                  showLearningWarnings={showLearningWarnings}
                  dealFilterInput={dealFilterInput}
                  isAlreadyAdded={existingNamesSet.has(match.lender.name.toLowerCase().trim())}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={`grid ${gridColsClass} gap-4 pb-4`}>
            {visibleTierColumns.map(col => (
              <TierColumn
                key={col.key}
                tier={col.key}
                label={col.label}
                matches={col.matches}
                selectedLenders={selectedLenders}
                onToggleLender={handleToggleLender}
                onAddLender={onAddLender}
                onViewDetail={setDetailLender}
                colorClass={col.colorClass}
                showLearningWarnings={showLearningWarnings}
                dealFilterInput={dealFilterInput}
                existingNamesSet={existingNamesSet}
              />
            ))}
          </div>
        )}
        
        {/* Other/Untiered lenders shown below grid if any */}
        {groupedByTier.other.length > 0 && (
          <div className="mt-4 pb-4">
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full mb-2 group">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Other / Untiered</span>
                  <Badge variant="secondary" className="text-xs">
                    {groupedByTier.other.length}
                  </Badge>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {groupedByTier.other.map(match => (
                    <LenderMatchCard
                      key={match.lender.id}
                      match={match}
                      isSelected={selectedLenders.has(match.lender.id)}
                      onToggle={() => handleToggleLender(match.lender.id)}
                      onAdd={() => onAddLender(match.lender.name)}
                      onViewDetail={() => setDetailLender(match.lender)}
                      badgeVariant="secondary"
                      compact
                      showLearningWarnings={showLearningWarnings}
                      dealFilterInput={dealFilterInput}
                      isAlreadyAdded={existingNamesSet.has(match.lender.name.toLowerCase().trim())}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </ScrollArea>

      {/* Lender Detail Dialog */}
      <LenderDetailDialog
        lender={detailLenderInfo}
        open={!!detailLender}
        onOpenChange={(open) => { if (!open) setDetailLender(null); }}
        onSave={async (lenderId, data) => {
          const updates: Partial<MasterLenderInsert> = {
            name: data.name.trim(),
            contact_name: data.contactName?.trim() || null,
            email: data.email?.trim() || null,
            lender_type: data.lenderType?.trim() || null,
            loan_types: data.loanTypes?.split(',').map(p => p.trim()).filter(Boolean) || null,
            min_deal: data.minDeal ? parseFloat(data.minDeal) : null,
            max_deal: data.maxDeal ? parseFloat(data.maxDeal) : null,
            industries: data.industries?.split(',').map(p => p.trim()).filter(Boolean) || null,
            geo: data.geo?.trim() || null,
            company_requirements: data.description?.trim() || null,
            deal_structure_notes: data.lenderNotes?.trim() || null,
            min_revenue: data.minRevenue ? parseFloat(data.minRevenue) : null,
            ebitda_min: data.ebitdaMin ? parseFloat(data.ebitdaMin) : null,
            tier: data.tier ? `T${data.tier}` : null,
            relationship_owners: data.relationshipOwners?.trim() || null,
          };
          const success = await updateLender(lenderId, updates);
          if (success) {
            toast.success(`${updates.name} updated`);
            // Update the detail view with new data
            const updated = masterLenders.find(l => l.id === lenderId);
            if (updated) setDetailLender({ ...updated, ...updates } as MasterLender);
          }
        }}
      />
    </div>
  );
}

interface TierColumnProps {
  tier: string;
  label: string;
  matches: LenderMatch[];
  selectedLenders: Set<string>;
  onToggleLender: (lenderId: string) => void;
  onAddLender: (name: string) => void;
  onViewDetail: (lender: MasterLender) => void;
  colorClass: string;
  showLearningWarnings?: boolean;
  dealFilterInput?: DealFilterInput;
  existingNamesSet: Set<string>;
}

function TierColumn({ tier, label, matches, selectedLenders, onToggleLender, onAddLender, onViewDetail, colorClass, showLearningWarnings, dealFilterInput, existingNamesSet }: TierColumnProps) {
  const selectedCount = matches.filter(m => selectedLenders.has(m.lender.id)).length;
  
  return (
    <div className="flex flex-col h-full">
      {/* Tier Header */}
      <div className={cn("rounded-t-lg px-3 py-2 flex items-center justify-between", colorClass)}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{label}</span>
          <Badge variant="secondary" className="text-xs bg-background/80">
            {selectedCount > 0 ? `${selectedCount}/${matches.length}` : matches.length}
          </Badge>
        </div>
      </div>
      
      {/* Lender Cards */}
      <div className="flex-1 border border-t-0 rounded-b-lg bg-muted/20 p-2 space-y-2 min-h-[200px] max-h-[400px] overflow-y-auto">
        {matches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            No {label} lenders match criteria
          </div>
        ) : (
          matches.map(match => (
            <LenderMatchCard
              key={match.lender.id}
              match={match}
              isSelected={selectedLenders.has(match.lender.id)}
              onToggle={() => onToggleLender(match.lender.id)}
              onAdd={() => onAddLender(match.lender.name)}
              onViewDetail={() => onViewDetail(match.lender)}
              badgeVariant="default"
              compact
              showLearningWarnings={showLearningWarnings}
              dealFilterInput={dealFilterInput}
              isAlreadyAdded={existingNamesSet.has(match.lender.name.toLowerCase().trim())}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface LenderMatchCardProps {
  match: LenderMatch;
  isSelected: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onViewDetail?: () => void;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  compact?: boolean;
  showLearningWarnings?: boolean;
  dealFilterInput?: DealFilterInput;
  isAlreadyAdded?: boolean;
}

function LenderMatchCard({ match, isSelected, onToggle, onAdd, onViewDetail, badgeVariant, compact = false, showLearningWarnings = true, dealFilterInput, isAlreadyAdded = false }: LenderMatchCardProps) {
  const { lender, matchReasons, warnings, score, learningWarnings } = match;

  const criteriaMatch = useMemo(() => {
    if (!dealFilterInput) return null;
    return countCriteriaMatches(dealFilterInput, lender);
  }, [dealFilterInput, lender]);
  
  return (
    <div
      className={cn(
        "border rounded-lg transition-colors group cursor-pointer relative",
        compact ? "p-2" : "p-3",
        isAlreadyAdded
          ? "bg-primary/5 border-primary/30 opacity-75"
          : "bg-card hover:bg-muted/30",
        isSelected && !isAlreadyAdded && "ring-2 ring-primary border-primary bg-primary/5"
      )}
      onClick={() => onViewDetail?.()}
    >
      {/* Already added indicator */}
      {isAlreadyAdded && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">
          <CheckCircle2 className="h-3 w-3" />
          Added
        </div>
      )}
      {/* Criteria match badge - top right */}
      {criteriaMatch && criteriaMatch.total > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                criteriaMatch.passed === criteriaMatch.total
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : criteriaMatch.passed >= criteriaMatch.total * 0.6
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              )}>
                <CheckCircle2 className="h-3 w-3" />
                {criteriaMatch.passed}/{criteriaMatch.total}
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              <p className="font-medium mb-1">Criteria Match: {criteriaMatch.passed}/{criteriaMatch.total}</p>
              {criteriaMatch.passedFilters.map(f => (
                <div key={f} className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> {f.replace('_', ' ')}
                </div>
              ))}
              {criteriaMatch.failedFilters.map(f => (
                <div key={f} className="flex items-center gap-1 text-destructive">
                  <Ban className="h-3 w-3" /> {f.replace('_', ' ')}
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <div className={cn("flex items-start gap-2", isAlreadyAdded && "mt-4")}>
        {!isAlreadyAdded && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            className="mt-0.5"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn("font-medium truncate", compact ? "text-xs" : "text-sm")}>
              {lender.name}
            </span>
            {/* Score indicator */}
            <Badge 
              variant={score >= 50 ? "default" : score >= 25 ? "secondary" : "outline"} 
              className="text-[9px] py-0 px-1 shrink-0"
            >
              {score}
            </Badge>
            {/* Learning warning badge */}
            {showLearningWarnings && learningWarnings && learningWarnings.length > 0 && (
              <LenderWarningBadge warnings={learningWarnings} showDetails size="sm" />
            )}
          </div>
          
          
          {/* Contact Info - only show if not compact */}
          {!compact && (lender.contact_name || lender.email) && (
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              {lender.contact_name && <span className="truncate">{lender.contact_name}</span>}
              {lender.contact_name && lender.email && <span>·</span>}
              {lender.email && (
                <a href={`mailto:${lender.email}`} className="hover:text-primary truncate">
                  {lender.email}
                </a>
              )}
            </div>
          )}
        </div>
        
        {/* Add Button - hidden for already added lenders */}
        {!isAlreadyAdded && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
              compact ? "h-6 w-6" : "h-7 w-7"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
          >
            <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} />
          </Button>
        )}
      </div>
    </div>
  );
}
