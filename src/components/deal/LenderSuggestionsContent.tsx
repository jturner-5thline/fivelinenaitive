import { useState, useMemo, useCallback } from 'react';
import { dealTypeIdsToLabels } from '@/utils/dealTypeLabels';
import { ChevronDown, Plus, Search, Building2, MapPin, DollarSign, AlertTriangle, CheckCircle2, Info, Filter, X, CheckSquare, Brain, Ban, Loader2, Sparkles, Zap } from 'lucide-react';
import { CopyableText } from '@/components/ui/CopyableText';
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
import { useLenderMatching, LenderMatch, DealCriteria, MatchTier } from '@/hooks/useLenderMatching';
import { useSemanticLenderMatching } from '@/hooks/useSemanticLenderMatching';
import { LenderWarningBadge } from './LenderWarningBadge';
import { LenderDetailDialog, LenderEditData } from '@/components/lenders/LenderDetailDialog';
import { MasterLenderInsert } from '@/hooks/useMasterLenders';
import { toast } from 'sonner';

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<MatchTier, { label: string; colorClass: string; icon: string }> = {
  top: { label: 'Top Match', colorClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', icon: '🏆' },
  strong: { label: 'Strong Match', colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', icon: '💪' },
  possible: { label: 'Possible Match', colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', icon: '🔍' },
  weak: { label: 'Other', colorClass: 'bg-muted text-muted-foreground', icon: '📋' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface LenderSuggestionsContentProps {
  criteria: DealCriteria;
  existingLenderNames: string[];
  onAddLender: (lenderName: string) => void;
  onAddMultipleLenders?: (lenderNames: string[]) => void;
  onNavigateToCriteria?: () => void;
  onClose?: () => void;
  autoDetected?: Record<string, boolean>;
}

export function LenderSuggestionsContent({
  criteria,
  existingLenderNames,
  onAddLender,
  onAddMultipleLenders,
  onNavigateToCriteria,
  onClose,
  autoDetected = {},
}: LenderSuggestionsContentProps) {
  const { lenders: masterLenders, loading, updateLender } = useMasterLenders();
  const [searchQuery, setSearchQuery] = useState('');
  const [lenderTypeFilter, setLenderTypeFilter] = useState<string>('all');
  const [selectedLenders, setSelectedLenders] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<MatchTier | 'all'>('all');
  const [showLearningWarnings, setShowLearningWarnings] = useState(true);
  const [detailLender, setDetailLender] = useState<MasterLender | null>(null);
  const [weakSectionExpanded, setWeakSectionExpanded] = useState(false);

  const detailLenderInfo = useMemo(() => {
    if (!detailLender) return null;
    return {
      id: detailLender.id,
      name: detailLender.name,
      contact: { name: detailLender.contact_name || '', title: '', email: detailLender.email || '', phone: '' },
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
      upfrontChecklist: detailLender.upfront_checklist,
      postTermSheetChecklist: detailLender.post_term_sheet_checklist,
      b2bB2c: detailLender.b2b_b2c,
      sponsorship: detailLender.sponsorship,
      cashBurn: detailLender.cash_burn,
      subDebt: detailLender.sub_debt,
      refinancing: detailLender.refinancing,
      industriesToAvoid: detailLender.industries_to_avoid,
      nda: detailLender.nda,
      referralLender: detailLender.referral_lender,
      referralFeeOffered: detailLender.referral_fee_offered,
      referralAgreement: detailLender.referral_agreement,
      aboutNotes: detailLender.about_notes,
      lenderOnePagerUrl: detailLender.lender_one_pager_url,
    };
  }, [detailLender]);

  // Phase 1: Rule-based matching
  const { matches: ruleMatches, learningEnabled } = useLenderMatching(masterLenders, criteria, {
    minScore: 30,
    maxResults: 100,
    excludeNames: existingLenderNames,
    enableLearning: true,
  });

  // Phase 2: Semantic AI enhancement (non-blocking)
  const hasRichContext = !!(criteria.companyDescription || criteria.dealNotes?.length || criteria.existingLenderFeedback?.length);
  const { enhancedMatches: matches, isSemanticLoading, hasSemanticData } = useSemanticLenderMatching(
    ruleMatches,
    criteria,
    hasRichContext
  );

  const existingNamesSet = useMemo(
    () => new Set(existingLenderNames.map(n => n.toLowerCase().trim())),
    [existingLenderNames]
  );

  const lenderTypes = useMemo(() => {
    const types = new Set<string>();
    matches.forEach(m => { if (m.lender.lender_type) types.add(m.lender.lender_type); });
    return Array.from(types).sort();
  }, [matches]);

  // Group by score-based tier
  const groupedByTier = useMemo(() => {
    const groups: Record<MatchTier, LenderMatch[]> = { top: [], strong: [], possible: [], weak: [] };
    let filtered = matches;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.lender.name.toLowerCase().includes(q) ||
        m.lender.lender_type?.toLowerCase().includes(q) ||
        m.lender.loan_types?.some(lt => lt.toLowerCase().includes(q)) ||
        m.lender.industries?.some(i => i.toLowerCase().includes(q))
      );
    }
    if (lenderTypeFilter !== 'all') {
      filtered = filtered.filter(m => m.lender.lender_type === lenderTypeFilter);
    }
    if (tierFilter !== 'all') {
      filtered = filtered.filter(m => m.tier === tierFilter);
    }

    for (const m of filtered) {
      groups[m.tier].push(m);
    }

    // Sort within each tier by combined score
    for (const tier of Object.keys(groups) as MatchTier[]) {
      groups[tier].sort((a, b) => b.combinedScore - a.combinedScore);
    }

    return groups;
  }, [matches, searchQuery, lenderTypeFilter, tierFilter]);

  const totalVisible = Object.values(groupedByTier).reduce((sum, arr) => sum + arr.length, 0);
  const mainTiers: MatchTier[] = ['top', 'strong', 'possible'];
  const mainMatches = mainTiers.flatMap(t => groupedByTier[t]);

  const handleToggleLender = (lenderId: string) => {
    setSelectedLenders(prev => {
      const next = new Set(prev);
      next.has(lenderId) ? next.delete(lenderId) : next.add(lenderId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = [...mainMatches, ...(weakSectionExpanded ? groupedByTier.weak : [])]
      .filter(m => !existingNamesSet.has(m.lender.name.toLowerCase().trim()))
      .map(m => m.lender.id);
    setSelectedLenders(new Set(allIds));
  };

  const handleAddSelected = () => {
    const names = matches
      .filter(m => selectedLenders.has(m.lender.id) && !existingNamesSet.has(m.lender.name.toLowerCase().trim()))
      .map(m => m.lender.name);
    if (onAddMultipleLenders) onAddMultipleLenders(names);
    else names.forEach(name => onAddLender(name));
    setSelectedLenders(new Set());
  };

  const isReady = !loading && masterLenders.length > 0;

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading lender database...</span>
      </div>
    );
  }

  const formatDealSize = (value: number | undefined, capitalAsk: string | undefined): string | null => {
    if (capitalAsk) return capitalAsk;
    if (!value) return null;
    return value >= 1000000
      ? `$${(value / 1000000) % 1 === 0 ? (value / 1000000).toFixed(0) : (value / 1000000).toFixed(1)}MM`
      : value >= 1000 ? `$${(value / 1000).toFixed(0)}K` : `$${value}`;
  };

  const dealSizeDisplay = formatDealSize(criteria.dealValue, criteria.capitalAsk);
  const selectableCount = [...mainMatches, ...(weakSectionExpanded ? groupedByTier.weak : [])]
    .filter(m => !existingNamesSet.has(m.lender.name.toLowerCase().trim())).length;

  return (
    <div className="flex flex-col h-full py-4">
      {/* Criteria Summary with Auto-detected badges */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">Matching criteria:</p>
        <div className="flex flex-wrap gap-1.5">
          {dealSizeDisplay && (
            <Badge className="text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
              <DollarSign className="h-3 w-3 mr-1" />Deal Size: {dealSizeDisplay}
            </Badge>
          )}
          {criteria.dealTypes && criteria.dealTypes.length > 0 && (
            <Badge className="text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              Type: {dealTypeIdsToLabels(criteria.dealTypes.slice(0, 2)).join(', ')}{criteria.dealTypes.length > 2 && ` +${criteria.dealTypes.length - 2}`}
            </Badge>
          )}
          {criteria.industry && (
            <Badge className="text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800 gap-1">
              <Building2 className="h-3 w-3" />{criteria.industry}
              {autoDetected?.industry && (
                <span className="text-[9px] opacity-70 ml-0.5 bg-purple-200 dark:bg-purple-800 rounded px-1">Auto</span>
              )}
            </Badge>
          )}
          {criteria.cashBurnOk !== undefined && (
            <Badge className="text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800">
              Cash Burn: {criteria.cashBurnOk ? 'OK' : 'No'}
            </Badge>
          )}
          {criteria.sponsorship && (
            <Badge className="text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800">
              {criteria.sponsorship}
            </Badge>
          )}
          {criteria.revenue && (
            <Badge className="text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800">
              Revenue: ${(criteria.revenue / 1000000).toFixed(1)}M
            </Badge>
          )}
          {hasSemanticData && (
            <Badge className="text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800 gap-1">
              <Sparkles className="h-3 w-3" />AI Enhanced
            </Badge>
          )}
          {isSemanticLoading && (
            <Badge variant="outline" className="text-xs gap-1 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />Analyzing...
            </Badge>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-2 mb-4 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search funding sources..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
          {searchQuery && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setSearchQuery('')}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select value={lenderTypeFilter} onValueChange={setLenderTypeFilter}>
          <SelectTrigger className="h-8 text-xs w-[130px] shrink-0"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Funding Source Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {lenderTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tier filter buttons */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {selectedLenders.size > 0 ? (
          <div className="flex items-center gap-2 w-full p-2 bg-primary/10 rounded-lg border border-primary/20">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium flex-1">{selectedLenders.size} selected</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedLenders(new Set())}>Clear</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleAddSelected}><Plus className="h-3 w-3 mr-1" />Add Selected</Button>
          </div>
        ) : (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSelectAll}>
              <CheckSquare className="h-3 w-3 mr-1" />Select All ({selectableCount})
            </Button>
            <div className="h-4 w-px bg-border" />
            {(['all', 'top', 'strong', 'possible', 'weak'] as const).map(tier => (
              <Button
                key={tier}
                variant={tierFilter === tier ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setTierFilter(tier)}
              >
                {tier === 'all' ? 'All' : TIER_CONFIG[tier].label}
                {tier !== 'all' && ` (${groupedByTier[tier].length})`}
              </Button>
            ))}
          </>
        )}
      </div>

      {/* Learning Toggle */}
      {learningEnabled && (
        <div className="flex items-center gap-2 text-xs mb-4">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <Label htmlFor="show-warnings" className="text-xs font-normal cursor-pointer">Show learning insights</Label>
          <Switch id="show-warnings" checked={showLearningWarnings} onCheckedChange={setShowLearningWarnings} className="scale-75" />
        </div>
      )}

      <ScrollArea className="flex-1 -mx-6 px-6">
        {totalVisible === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No matching lenders found. Try adjusting the deal criteria or filters.
          </div>
        ) : (
          <>
            {mainTiers.map(tier => {
              const tierMatches = groupedByTier[tier];
              if (tierMatches.length === 0) return null;
              const config = TIER_CONFIG[tier];
              return (
                <div key={tier} className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{config.icon}</span>
                    <Badge className={config.colorClass}>{config.label}</Badge>
                    <span className="text-xs text-muted-foreground">({tierMatches.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {tierMatches.map(match => (
                      <LenderMatchCard
                        key={match.lender.id}
                        match={match}
                        isSelected={selectedLenders.has(match.lender.id)}
                        onToggle={() => handleToggleLender(match.lender.id)}
                        onAdd={() => onAddLender(match.lender.name)}
                        onViewDetail={() => setDetailLender(match.lender)}
                        showLearningWarnings={showLearningWarnings}
                        isAlreadyAdded={existingNamesSet.has(match.lender.name.toLowerCase().trim())}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Weak tier in collapsible */}
            {groupedByTier.weak.length > 0 && (
              <div className="mt-2 pb-4">
                <Collapsible open={weakSectionExpanded} onOpenChange={setWeakSectionExpanded}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full mb-2 group" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{TIER_CONFIG.weak.icon}</span>
                      <span className="text-sm font-medium">Other Matches</span>
                      <Badge variant="secondary" className="text-xs">{groupedByTier.weak.length}</Badge>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {groupedByTier.weak.map(match => (
                        <LenderMatchCard
                          key={match.lender.id}
                          match={match}
                          isSelected={selectedLenders.has(match.lender.id)}
                          onToggle={() => handleToggleLender(match.lender.id)}
                          onAdd={() => onAddLender(match.lender.name)}
                          onViewDetail={() => setDetailLender(match.lender)}
                          showLearningWarnings={showLearningWarnings}
                          isAlreadyAdded={existingNamesSet.has(match.lender.name.toLowerCase().trim())}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </>
        )}
      </ScrollArea>

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
            b2b_b2c: data.b2bB2c?.trim() || null,
            sponsorship: data.sponsorship?.trim() || null,
            cash_burn: data.cashBurn?.trim() || null,
            sub_debt: data.subDebt?.trim() || null,
            refinancing: data.refinancing?.trim() || null,
            industries_to_avoid: data.industriesToAvoid
              ? data.industriesToAvoid.split(',').map(p => p.trim()).filter(Boolean)
              : null,
            nda: data.nda?.trim() || null,
            referral_lender: data.referralLender?.trim() || null,
            referral_fee_offered: data.referralFeeOffered?.trim() || null,
            referral_agreement: data.referralAgreement?.trim() || null,
            about_notes: data.aboutNotes?.trim() || null,
            lender_one_pager_url: data.lenderOnePagerUrl?.trim() || null,
            upfront_checklist: data.upfrontChecklist?.trim() || null,
            post_term_sheet_checklist: data.postTermSheetChecklist?.trim() || null,
          };
          const success = await updateLender(lenderId, updates);
          if (success) {
            toast.success(`${updates.name} updated`);
            const updated = masterLenders.find(l => l.id === lenderId);
            if (updated) setDetailLender({ ...updated, ...updates } as MasterLender);
          }
        }}
      />
    </div>
  );
}

// ─── Funding Source Match Card ────────────────────────────────────────────────────────

interface LenderMatchCardProps {
  match: LenderMatch;
  isSelected: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onViewDetail?: () => void;
  showLearningWarnings?: boolean;
  isAlreadyAdded?: boolean;
}

function LenderMatchCard({ match, isSelected, onToggle, onAdd, onViewDetail, showLearningWarnings = true, isAlreadyAdded = false }: LenderMatchCardProps) {
  const { lender, matchReasons, warnings, combinedScore, matchPercent, tier, semanticBonus, semanticReason, semanticLoading, learningWarnings } = match;

  const tierConfig = TIER_CONFIG[tier];

  // Pick top 3 match reasons as chips
  const topReasons = matchReasons.slice(0, 3);

  return (
    <div
      className={cn(
        "border rounded-lg transition-colors group cursor-pointer relative p-2.5",
        isAlreadyAdded
          ? "bg-primary/5 border-primary/30 opacity-75"
          : "bg-card hover:bg-muted/30",
        isSelected && !isAlreadyAdded && "ring-2 ring-primary border-primary bg-primary/5"
      )}
      onClick={() => onViewDetail?.()}
    >
      {/* Already added */}
      {isAlreadyAdded && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">
          <CheckCircle2 className="h-3 w-3" />Added
        </div>
      )}

      {/* Match percentage badge */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        {semanticBonus > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-0.5 text-[10px] text-violet-600 dark:text-violet-400">
                  <Sparkles className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs max-w-[200px]">
                <p className="font-medium">AI Enhanced (+{semanticBonus}pts)</p>
                {semanticReason && <p className="mt-1 text-muted-foreground">{semanticReason}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {semanticLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
        )}
        <div className={cn(
          "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          tier === 'top' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            : tier === 'strong' ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
            : tier === 'possible' ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
            : "bg-muted text-muted-foreground"
        )}>
          {matchPercent}%
        </div>
      </div>

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
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-medium text-xs truncate">{lender.name}</span>
            {showLearningWarnings && learningWarnings && learningWarnings.length > 0 && (
              <LenderWarningBadge warnings={learningWarnings} showDetails size="sm" />
            )}
          </div>

          {/* Top match reasons as chips */}
          {topReasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {topReasons.map((reason, i) => (
                <span key={i} className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border">
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warnings.slice(0, 2).map((w, i) => (
                <span key={i} className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{w}
                </span>
              ))}
            </div>
          )}
        </div>

        {!isAlreadyAdded && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
