import { useState, useMemo } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Plus, Search, Building2, Mail, MapPin, DollarSign, AlertTriangle, CheckCircle2, Info, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface LenderSuggestionsProps {
  criteria: DealCriteria;
  existingLenderNames: string[];
  onAddLender: (lenderName: string) => void;
  className?: string;
}

export function LenderSuggestions({
  criteria,
  existingLenderNames,
  onAddLender,
  className,
}: LenderSuggestionsProps) {
  const { lenders: masterLenders, loading } = useMasterLenders();
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [lenderTypeFilter, setLenderTypeFilter] = useState<string>('all');
  const [showOnlyHighScore, setShowOnlyHighScore] = useState(false);
  
  const { matches } = useLenderMatching(masterLenders, criteria, {
    minScore: -10, // Allow some warnings but filter out worst matches
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
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.lender.name.toLowerCase().includes(query) ||
        m.lender.lender_type?.toLowerCase().includes(query) ||
        m.lender.loan_types?.some(lt => lt.toLowerCase().includes(query)) ||
        m.lender.industries?.some(i => i.toLowerCase().includes(query))
      );
    }
    
    // Lender type filter
    if (lenderTypeFilter !== 'all') {
      filtered = filtered.filter(m => m.lender.lender_type === lenderTypeFilter);
    }
    
    // High score filter
    if (showOnlyHighScore) {
      filtered = filtered.filter(m => m.score >= 25);
    }
    
    return filtered;
  }, [matches, searchQuery, lenderTypeFilter, showOnlyHighScore]);
  
  // Group by score tiers
  const groupedMatches = useMemo(() => {
    const excellent: LenderMatch[] = [];
    const good: LenderMatch[] = [];
    const possible: LenderMatch[] = [];
    
    filteredMatches.forEach(match => {
      if (match.score >= 40) {
        excellent.push(match);
      } else if (match.score >= 20) {
        good.push(match);
      } else if (match.score >= 0) {
        possible.push(match);
      }
    });
    
    return { excellent, good, possible };
  }, [filteredMatches]);
  
  const totalMatches = groupedMatches.excellent.length + groupedMatches.good.length + groupedMatches.possible.length;
  
  if (loading) {
    return (
      <Card className={cn("border-primary/20", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="bg-brand-gradient bg-clip-text text-transparent">AI Lender Suggestions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Loading lender database...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (masterLenders.length === 0) {
    return (
      <Card className={cn("border-muted", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Lender Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Import your master lender database to get AI-powered suggestions based on deal characteristics.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("border-primary/20 bg-gradient-to-b from-primary/5 to-transparent", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                Suggested Lenders
              </span>
              <Badge variant="secondary" className="ml-1 font-normal">
                {totalMatches} matches
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          
          {/* Criteria Summary */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {criteria.industry && (
              <Badge variant="outline" className="text-xs font-normal">
                <Building2 className="h-3 w-3 mr-1" />
                {criteria.industry}
              </Badge>
            )}
            {(criteria.capitalAsk || criteria.dealValue) && (
              <Badge variant="outline" className="text-xs font-normal">
                <DollarSign className="h-3 w-3 mr-1" />
                {criteria.capitalAsk || `$${(criteria.dealValue! / 1000000).toFixed(1)}M`}
              </Badge>
            )}
            {criteria.dealTypes && criteria.dealTypes.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                {criteria.dealTypes.slice(0, 2).join(', ')}
                {criteria.dealTypes.length > 2 && ` +${criteria.dealTypes.length - 2}`}
              </Badge>
            )}
            {criteria.geo && (
              <Badge variant="outline" className="text-xs font-normal">
                <MapPin className="h-3 w-3 mr-1" />
                {criteria.geo}
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-2">
            {/* Search and Filters */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="relative">
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
            
            <ScrollArea className="h-[400px] pr-3">
              <div className="space-y-4">
                {/* Excellent Matches */}
                {groupedMatches.excellent.length > 0 && (
                  <MatchGroup
                    title="Excellent Matches"
                    icon={<CheckCircle2 className="h-4 w-4 text-success" />}
                    matches={groupedMatches.excellent}
                    onAddLender={onAddLender}
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface MatchGroupProps {
  title: string;
  icon: React.ReactNode;
  matches: LenderMatch[];
  onAddLender: (name: string) => void;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  defaultCollapsed?: boolean;
}

function MatchGroup({ title, icon, matches, onAddLender, badgeVariant = 'default', defaultCollapsed = false }: MatchGroupProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full mb-2 group">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="text-xs">
            {matches.length}
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
  onAdd: () => void;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

function LenderMatchCard({ match, onAdd, badgeVariant }: LenderMatchCardProps) {
  const { lender, matchReasons, warnings, score } = match;
  
  return (
    <div className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors group">
      <div className="flex items-start justify-between gap-2">
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
