import { useState, useEffect } from 'react';
import { Search, Building2, Landmark, TrendingUp, RefreshCw, ExternalLink, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useDealResearch, ResearchType, ResearchResult } from '@/hooks/useDealResearch';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DealResearchPanelProps {
  companyName: string;
  companyUrl?: string;
  industry?: string;
  dealValue?: number;
  lenders?: { name: string }[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const researchTypeConfig = {
  company: {
    icon: Building2,
    label: 'Company Intel',
    description: 'Research the borrower company',
  },
  lender: {
    icon: Landmark,
    label: 'Lender Intel',
    description: 'Research a specific lender',
  },
  industry: {
    icon: TrendingUp,
    label: 'Industry Brief',
    description: 'Market trends & lending climate',
  },
};

function ResearchContent({ content, citations }: { content: string; citations: string[] }) {
  // Parse markdown-like formatting
  const formatContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // Headers
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
              <h4 className="font-semibold text-foreground mb-1">{match[1]}</h4>
              {match[2] && <p className="text-muted-foreground text-sm">{match[2]}</p>}
            </div>
          );
        }
      }
      // Bullet points
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return (
          <li key={i} className="text-sm text-muted-foreground ml-4 mb-1">
            {line.substring(2)}
          </li>
        );
      }
      // Regular paragraph
      if (line.trim()) {
        return (
          <p key={i} className="text-sm text-muted-foreground mb-2">
            {line}
          </p>
        );
      }
      return null;
    });
  };

  return (
    <div className="space-y-2">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {formatContent(content)}
      </div>
      
      {citations.length > 0 && (
        <div className="pt-3 border-t border-border mt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Sources</p>
          <div className="flex flex-wrap gap-1">
            {citations.slice(0, 5).map((url, i) => {
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
            {citations.length > 5 && (
              <span className="text-xs text-muted-foreground">+{citations.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DealResearchPanel({
  companyName,
  companyUrl,
  industry,
  dealValue,
  lenders = [],
  isOpen: externalIsOpen,
  onOpenChange: externalOnOpenChange,
}: DealResearchPanelProps) {
  const { fetchResearch, isLoading, error } = useDealResearch();
  const [activeType, setActiveType] = useState<ResearchType>('company');
  const [selectedLender, setSelectedLender] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ResearchResult>>({});
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  
  // Use external control if provided, otherwise use internal state
  const isExpanded = externalIsOpen !== undefined ? externalIsOpen : internalIsExpanded;
  const setIsExpanded = externalOnOpenChange || setInternalIsExpanded;

  const handleResearch = async (type: ResearchType, lenderName?: string) => {
    setActiveType(type);
    if (type === 'lender' && lenderName) {
      setSelectedLender(lenderName);
    }

    const cacheKey = type === 'lender' ? `lender:${lenderName}` : type;
    
    // Check if we already have this result
    if (results[cacheKey]) {
      return;
    }

    const result = await fetchResearch({
      companyName,
      companyUrl,
      industry,
      dealValue,
      researchType: type,
      lenderName: type === 'lender' ? lenderName : undefined,
    });

    if (result) {
      setResults(prev => ({ ...prev, [cacheKey]: result }));
    }
  };

  const refreshResearch = async () => {
    const cacheKey = activeType === 'lender' ? `lender:${selectedLender}` : activeType;
    setResults(prev => {
      const newResults = { ...prev };
      delete newResults[cacheKey];
      return newResults;
    });
    
    await handleResearch(activeType, selectedLender || undefined);
  };

  const getCurrentResult = () => {
    const cacheKey = activeType === 'lender' ? `lender:${selectedLender}` : activeType;
    return results[cacheKey];
  };

  const currentResult = getCurrentResult();

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Research
                <Badge variant="secondary" className="text-xs font-normal">
                  Powered by Perplexity
                </Badge>
              </CardTitle>
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Research Type Tabs */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(researchTypeConfig) as ResearchType[]).map((type) => {
                const config = researchTypeConfig[type];
                const Icon = config.icon;
                const isActive = activeType === type && (type !== 'lender' || selectedLender);
                
                if (type === 'lender' && lenders.length === 0) return null;
                if (type === 'industry' && !industry) return null;
                
                return (
                  <Button
                    key={type}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      if (type === 'lender') {
                        // Show first lender by default
                        handleResearch(type, lenders[0]?.name);
                      } else {
                        handleResearch(type);
                      }
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </Button>
                );
              })}
            </div>

            {/* Lender Selector (if lender type selected) */}
            {activeType === 'lender' && lenders.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lenders.slice(0, 8).map((lender) => (
                  <Button
                    key={lender.name}
                    variant={selectedLender === lender.name ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleResearch('lender', lender.name)}
                  >
                    {lender.name}
                  </Button>
                ))}
                {lenders.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{lenders.length - 8} more
                  </span>
                )}
              </div>
            )}

            {/* Research Results */}
            <div className="min-h-[200px]">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-2"
                    onClick={refreshResearch}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              ) : currentResult ? (
                <ScrollArea className="h-[350px] pr-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Last updated: {format(new Date(currentResult.timestamp), 'MMM d, h:mm a')}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={refreshResearch}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </Button>
                    </div>
                    <ResearchContent 
                      content={currentResult.content} 
                      citations={currentResult.citations} 
                    />
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12">
                  <Search className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm mb-1">
                    Get AI-powered research insights
                  </p>
                  <p className="text-muted-foreground/70 text-xs mb-4">
                    Click a research type above to start
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleResearch('company')}
                  >
                    <Building2 className="h-4 w-4" />
                    Research {companyName}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
