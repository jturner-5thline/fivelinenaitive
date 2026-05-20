import { useState } from 'react';
import { Search, Building2, Landmark, TrendingUp, RefreshCw, ExternalLink, Globe, BarChart3, DollarSign, Zap, Loader2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDealResearch as useLegacyDealResearch, ResearchType as LegacyResearchType, ResearchResult } from '@/hooks/useDealResearch';
import { useDealResearch, useRunDealResearch, DealResearchItem, RESEARCH_TYPE_LABELS, ResearchType } from '@/hooks/useDealResearchAgent';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DealResearchPanelProps {
  dealId?: string;
  companyName: string;
  companyUrl?: string;
  industry?: string;
  dealValue?: number;
  lenders?: { name: string }[];
}

const researchTypeConfig: Record<string, { icon: any; label: string; description: string; color: string }> = {
  company: {
    icon: Building2,
    label: 'Company Intel',
    description: 'Company overview & risk factors',
    color: 'text-blue-500',
  },
  industry: {
    icon: TrendingUp,
    label: 'Industry',
    description: 'Market trends & lending climate',
    color: 'text-green-500',
  },
  lender_matching: {
    icon: Landmark,
    label: 'Funding Source Match',
    description: 'Best-fit lender recommendations',
    color: 'text-purple-500',
  },
  competitive_intel: {
    icon: Globe,
    label: 'Competitive Intel',
    description: 'Competitors & market position',
    color: 'text-orange-500',
  },
  market_sizing: {
    icon: BarChart3,
    label: 'Market Sizing',
    description: 'TAM & market segmentation',
    color: 'text-cyan-500',
  },
  rate_environment: {
    icon: DollarSign,
    label: 'Rate Environment',
    description: 'Current rates & spreads',
    color: 'text-yellow-500',
  },
  // Legacy types
  lender: {
    icon: Landmark,
    label: 'Lender Intel',
    description: 'Research a specific lender',
    color: 'text-purple-500',
  },
};

function ResearchContent({ content, citations }: { content: string; citations: string[] | any }) {
  const citationsArray = Array.isArray(citations) ? citations : [];
  
  const formatContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('###')) {
        return (
          <h4 key={i} className="font-semibold text-foreground mt-4 mb-2 first:mt-0 text-sm">
            {line.replace(/^#+\s*/, '').replace(/\*\*/g, '')}
          </h4>
        );
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return (
          <h4 key={i} className="font-semibold text-foreground mt-4 mb-2 first:mt-0">
            {line.replace(/\*\*/g, '')}
          </h4>
        );
      }
      if (line.match(/^\d+\.\s*\*\*/)) {
        const match = line.match(/^\d+\.\s*\*\*([^*]+)\*\*:?\s*(.*)$/);
        if (match) {
          return (
            <div key={i} className="mt-3 first:mt-0">
              <h4 className="font-semibold text-foreground mb-1 text-sm">{match[1]}</h4>
              {match[2] && <p className="text-muted-foreground text-sm">{match[2]}</p>}
            </div>
          );
        }
      }
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return (
          <li key={i} className="text-sm text-muted-foreground ml-4 mb-1">
            {line.substring(2).replace(/\*\*([^*]+)\*\*/g, '$1')}
          </li>
        );
      }
      if (line.trim()) {
        return (
          <p key={i} className="text-sm text-muted-foreground mb-2">
            {line.replace(/\*\*([^*]+)\*\*/g, '$1')}
          </p>
        );
      }
      return null;
    });
  };

  return (
    <div>
      {formatContent(content)}
      
      {citationsArray.length > 0 && (
        <div className="pt-3 border-t border-border mt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Sources</p>
          <div className="flex flex-wrap gap-1">
            {citationsArray.slice(0, 5).map((url: string, i: number) => {
              try {
                const hostname = new URL(url).hostname.replace('www.', '');
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline bg-primary/10 px-2 py-0.5 rounded"
                  >
                    {hostname}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                );
              } catch {
                return null;
              }
            })}
            {citationsArray.length > 5 && (
              <span className="text-xs text-muted-foreground">+{citationsArray.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DealResearchPanel({
  dealId,
  companyName,
  companyUrl,
  industry,
  dealValue,
  lenders = [],
}: DealResearchPanelProps) {
  // Orchestrated research (new)
  const { data: cachedResearch, isLoading: isCacheLoading } = useDealResearch(dealId);
  const runResearch = useRunDealResearch();
  
  // Legacy research for lender-specific intel
  const { fetchResearch, isLoading: isLegacyLoading, error: legacyError } = useLegacyDealResearch();
  
  const [activeType, setActiveType] = useState<string>('company');
  const [selectedLender, setSelectedLender] = useState<string | null>(null);
  const [legacyResults, setLegacyResults] = useState<Record<string, ResearchResult>>({});

  const isLoading = runResearch.isPending || isLegacyLoading;

  // Get research item from cache by type
  const getCachedItem = (type: string): DealResearchItem | undefined => {
    return cachedResearch?.find(r => r.research_type === type);
  };

  const handleRunAll = () => {
    if (!dealId) return;
    runResearch.mutate({ dealId, forceRefresh: false });
  };

  const handleRunSingle = (type: string) => {
    if (!dealId) return;
    setActiveType(type);
    runResearch.mutate({ dealId, researchTypes: [type as ResearchType], forceRefresh: true });
  };

  const handleLenderResearch = async (lenderName: string) => {
    setActiveType('lender');
    setSelectedLender(lenderName);
    
    const cacheKey = `lender:${lenderName}`;
    if (legacyResults[cacheKey]) return;

    const result = await fetchResearch({
      companyName,
      companyUrl,
      industry,
      dealValue,
      researchType: 'lender',
      lenderName,
    });

    if (result) {
      setLegacyResults(prev => ({ ...prev, [cacheKey]: result }));
    }
  };

  const getCurrentContent = () => {
    if (activeType === 'lender' && selectedLender) {
      const cacheKey = `lender:${selectedLender}`;
      const legacy = legacyResults[cacheKey];
      if (legacy) return { content: legacy.content, citations: legacy.citations, timestamp: legacy.timestamp };
      return null;
    }
    
    const cached = getCachedItem(activeType);
    if (cached) return { content: cached.content, citations: cached.citations, timestamp: cached.created_at };
    return null;
  };

  const currentContent = getCurrentContent();
  const orchestratedTypes = ['company', 'industry', 'lender_matching', 'competitive_intel', 'market_sizing', 'rate_environment'];
  const hasAnyCached = cachedResearch && cachedResearch.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Research Agent
          </Badge>
          {hasAnyCached && (
            <span className="text-xs text-muted-foreground">
              {cachedResearch.length}/{orchestratedTypes.length} ready
            </span>
          )}
        </div>
        {dealId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-7 text-xs"
            onClick={handleRunAll}
            disabled={isLoading}
          >
            {runResearch.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {hasAnyCached ? 'Refresh All' : 'Run Full Analysis'}
          </Button>
        )}
      </div>

      {/* Research Type Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {orchestratedTypes.map((type) => {
          const config = researchTypeConfig[type];
          if (!config) return null;
          const Icon = config.icon;
          const isActive = activeType === type;
          const hasCached = !!getCachedItem(type);
          
          return (
            <button
              key={type}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-colors',
                isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                hasCached && !isActive && 'border-green-500/30 bg-green-500/5'
              )}
              onClick={() => {
                setActiveType(type);
                if (!getCachedItem(type) && dealId) {
                  runResearch.mutate({ dealId, researchTypes: [type as ResearchType] });
                }
              }}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : config.color)} />
              <span className="text-[10px] font-medium leading-tight">{config.label}</span>
              {hasCached && (
                <div className="h-1 w-1 rounded-full bg-green-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Lender Intel Section */}
      {lenders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground self-center mr-1">Lender Intel:</span>
          {lenders.slice(0, 6).map((lender) => (
            <Button
              key={lender.name}
              variant={activeType === 'lender' && selectedLender === lender.name ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => handleLenderResearch(lender.name)}
            >
              {lender.name}
            </Button>
          ))}
          {lenders.length > 6 && (
            <span className="text-xs text-muted-foreground self-center">+{lenders.length - 6}</span>
          )}
        </div>
      )}

      {/* Results */}
      <div className="min-h-[200px]">
        {isLoading && !currentContent ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Researching {researchTypeConfig[activeType]?.label || activeType}...
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : currentContent ? (
          <ScrollArea className="h-[350px] pr-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {format(new Date(currentContent.timestamp), 'MMM d, h:mm a')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => {
                    if (activeType === 'lender') {
                      handleLenderResearch(selectedLender!);
                    } else {
                      handleRunSingle(activeType);
                    }
                  }}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                  Refresh
                </Button>
              </div>
              <ResearchContent 
                content={currentContent.content} 
                citations={currentContent.citations} 
              />
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-12">
            <Search className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm mb-1">
              AI-powered deal research
            </p>
            <p className="text-muted-foreground/70 text-xs mb-4">
              Click a research type or run full analysis
            </p>
            {dealId ? (
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={handleRunAll}
                disabled={isLoading}
              >
                <Zap className="h-4 w-4" />
                Run Full Analysis
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setActiveType('company');
                  fetchResearch({ companyName, companyUrl, industry, dealValue, researchType: 'company' }).then(r => {
                    if (r) setLegacyResults(prev => ({ ...prev, company: r }));
                  });
                }}
              >
                <Building2 className="h-4 w-4" />
                Research {companyName}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
