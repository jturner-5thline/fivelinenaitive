import { useState, useMemo } from 'react';
import { ChevronDown, Plus, Search, Building2, MapPin, DollarSign, AlertTriangle, CheckCircle2, Info, Filter, X, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useMasterLenders } from '@/hooks/useMasterLenders';
import { useLenderMatching, LenderMatch, DealCriteria } from '@/hooks/useLenderMatching';

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
  const { lenders: masterLenders, loading } = useMasterLenders();
  const [searchQuery, setSearchQuery] = useState('');
  const [lenderTypeFilter, setLenderTypeFilter] = useState<string>('all');
  const [showOnlyHighScore, setShowOnlyHighScore] = useState(false);
  const [selectedLenders, setSelectedLenders] = useState<Set<string>>(new Set());
  
  const { matches } = useLenderMatching(masterLenders, criteria, {
    minScore: -10,
    maxResults: 100,
    excludeNames: existingLenderNames,
  });
  
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
    
    return filtered;
  }, [matches, searchQuery, lenderTypeFilter, showOnlyHighScore]);
  
  // Group by score tiers - adjusted for new scoring system
  const groupedMatches = useMemo(() => {
    const excellent: LenderMatch[] = [];
    const good: LenderMatch[] = [];
    const possible: LenderMatch[] = [];
    
    filteredMatches.forEach(match => {
      if (match.score >= 50) {
        excellent.push(match);
      } else if (match.score >= 25) {
        good.push(match);
      } else if (match.score >= 0) {
        possible.push(match);
      }
    });
    
    return { excellent, good, possible };
  }, [filteredMatches]);
  
  const totalMatches = groupedMatches.excellent.length + groupedMatches.good.length + groupedMatches.possible.length;

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
    const allIds = filteredMatches.map(m => m.lender.id);
    setSelectedLenders(new Set(allIds));
  };

  const handleClearSelection = () => {
    setSelectedLenders(new Set());
  };

  const handleAddSelected = () => {
    const selectedNames = filteredMatches
      .filter(m => selectedLenders.has(m.lender.id))
      .map(m => m.lender.name);
    
    if (onAddMultipleLenders) {
      onAddMultipleLenders(selectedNames);
    } else {
      selectedNames.forEach(name => onAddLender(name));
    }
    setSelectedLenders(new Set());
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading lender database...
      </div>
    );
  }
  
  if (masterLenders.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Import your master lender database to get AI-powered suggestions based on deal characteristics.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full py-4">
      {/* Criteria Summary */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">Matching criteria (priority order):</p>
        <div className="flex flex-wrap gap-1.5">
          {(criteria.capitalAsk || criteria.dealValue) && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5">
              <DollarSign className="h-3 w-3 mr-1" />
              Deal Size: {criteria.capitalAsk || `$${(criteria.dealValue! / 1000000).toFixed(1)}M`}
            </Badge>
          )}
          {criteria.cashBurnOk !== undefined && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5">
              Cash Burn: {criteria.cashBurnOk ? 'OK' : 'No'}
            </Badge>
          )}
          {criteria.dealTypes && criteria.dealTypes.length > 0 && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5">
              Loan: {criteria.dealTypes.slice(0, 2).join(', ')}
              {criteria.dealTypes.length > 2 && ` +${criteria.dealTypes.length - 2}`}
            </Badge>
          )}
          {criteria.geo && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5">
              <MapPin className="h-3 w-3 mr-1" />
              {criteria.geo}
            </Badge>
          )}
          {criteria.industry && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5">
              <Building2 className="h-3 w-3 mr-1" />
              {criteria.industry}
            </Badge>
          )}
          {criteria.b2bB2c && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5">
              {criteria.b2bB2c}
            </Badge>
          )}
          {criteria.companyRequirements && (
            <Badge variant="outline" className="text-xs font-normal bg-primary/5 max-w-[150px] truncate">
              Req: {criteria.companyRequirements}
            </Badge>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lenders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
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
        
        <div className="flex gap-2">
          <Select value={lenderTypeFilter} onValueChange={setLenderTypeFilter}>
            <SelectTrigger className="h-8 text-xs flex-1">
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
            className="h-8 text-xs"
            onClick={() => setShowOnlyHighScore(!showOnlyHighScore)}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Top Matches
          </Button>
        </div>
      </div>

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

      {/* Select All / Clear All buttons */}
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
        </div>
      )}
      
      <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="space-y-4 pb-4">
          {/* Excellent Matches */}
          {groupedMatches.excellent.length > 0 && (
            <MatchGroup
              title="Excellent Matches"
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              matches={groupedMatches.excellent}
              onAddLender={onAddLender}
              selectedLenders={selectedLenders}
              onToggleLender={handleToggleLender}
              badgeVariant="default"
            />
          )}
          
          {/* Good Matches */}
          {groupedMatches.good.length > 0 && (
            <MatchGroup
              title="Good Matches"
              icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
              matches={groupedMatches.good}
              onAddLender={onAddLender}
              selectedLenders={selectedLenders}
              onToggleLender={handleToggleLender}
              badgeVariant="default"
            />
          )}
          
          {/* Possible Matches */}
          {groupedMatches.possible.length > 0 && (
            <MatchGroup
              title="Other Options"
              icon={<Info className="h-4 w-4 text-muted-foreground" />}
              matches={groupedMatches.possible}
              onAddLender={onAddLender}
              selectedLenders={selectedLenders}
              onToggleLender={handleToggleLender}
              badgeVariant="secondary"
              defaultCollapsed
            />
          )}
          
          {totalMatches === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No matching lenders found. Try adjusting the deal criteria or filters.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface MatchGroupProps {
  title: string;
  icon: React.ReactNode;
  matches: LenderMatch[];
  onAddLender: (name: string) => void;
  selectedLenders: Set<string>;
  onToggleLender: (lenderId: string) => void;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  defaultCollapsed?: boolean;
}

function MatchGroup({ title, icon, matches, onAddLender, selectedLenders, onToggleLender, badgeVariant = 'default', defaultCollapsed = false }: MatchGroupProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  const selectedCount = matches.filter(m => selectedLenders.has(m.lender.id)).length;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full mb-2 group">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="text-xs">
            {selectedCount > 0 ? `${selectedCount}/${matches.length}` : matches.length}
          </Badge>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground transition-transform",
          isOpen && "rotate-180"
        )} />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-2">
        {matches.map(match => (
          <LenderMatchCard
            key={match.lender.id}
            match={match}
            isSelected={selectedLenders.has(match.lender.id)}
            onToggle={() => onToggleLender(match.lender.id)}
            onAdd={() => onAddLender(match.lender.name)}
            badgeVariant={badgeVariant}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface LenderMatchCardProps {
  match: LenderMatch;
  isSelected: boolean;
  onToggle: () => void;
  onAdd: () => void;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

function LenderMatchCard({ match, isSelected, onToggle, onAdd, badgeVariant }: LenderMatchCardProps) {
  const { lender, matchReasons, warnings } = match;
  
  return (
    <div className={cn(
      "border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors group",
      isSelected && "ring-2 ring-primary border-primary bg-primary/5"
    )}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{lender.name}</span>
            {lender.lender_type && (
              <Badge variant="outline" className="text-xs shrink-0">
                {lender.lender_type}
              </Badge>
            )}
          </div>
          
          {/* Contact Info */}
          {(lender.contact_name || lender.email) && (
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-2">
              {lender.contact_name && <span>{lender.contact_name}</span>}
              {lender.contact_name && lender.email && <span>·</span>}
              {lender.email && (
                <a href={`mailto:${lender.email}`} className="hover:text-primary truncate">
                  {lender.email}
                </a>
              )}
            </div>
          )}
          
          {/* Match Reasons */}
          {matchReasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {matchReasons.slice(0, 3).map((reason, i) => (
                <Badge key={i} variant={badgeVariant} className="text-[10px] font-normal py-0">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                  {reason}
                </Badge>
              ))}
              {matchReasons.length > 3 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="secondary" className="text-[10px] py-0">
                        +{matchReasons.length - 3} more
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <ul className="text-xs space-y-1">
                        {matchReasons.slice(3).map((reason, i) => (
                          <li key={i}>✓ {reason}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
          
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warnings.map((warning, i) => (
                <Badge key={i} variant="outline" className="text-[10px] font-normal py-0 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  {warning}
                </Badge>
              ))}
            </div>
          )}
          
          {/* Loan Types & Deal Range */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            {lender.loan_types && lender.loan_types.length > 0 && (
              <span className="truncate max-w-[200px]">
                {lender.loan_types.slice(0, 3).join(', ')}
                {lender.loan_types.length > 3 && ` +${lender.loan_types.length - 3}`}
              </span>
            )}
            {(lender.min_deal || lender.max_deal) && (
              <span>
                {lender.min_deal ? `$${(lender.min_deal / 1000).toFixed(0)}K` : '—'} 
                {' - '}
                {lender.max_deal ? `$${(lender.max_deal / 1000000).toFixed(1)}M` : '—'}
              </span>
            )}
          </div>
        </div>
        
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
