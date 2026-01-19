import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  FileText, 
  ChevronDown, 
  RefreshCw, 
  ExternalLink,
  Building2,
  Search
} from 'lucide-react';
import { usePerplexityResearch, ResearchResult } from '@/hooks/usePerplexityResearch';
import { formatDistanceToNow } from 'date-fns';

interface SecFilingsPanelProps {
  companyName?: string;
  ticker?: string;
}

const FILING_TYPES = [
  { id: '10-K', label: '10-K (Annual Report)' },
  { id: '10-Q', label: '10-Q (Quarterly Report)' },
  { id: '8-K', label: '8-K (Material Events)' },
  { id: 'DEF 14A', label: 'DEF 14A (Proxy Statement)' },
  { id: 'S-1', label: 'S-1 (IPO Registration)' },
];

export function SecFilingsPanel({
  companyName = '',
  ticker = '',
}: SecFilingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [formData, setFormData] = useState({
    companyName,
    ticker,
    filingTypes: ['10-K', '10-Q', '8-K'],
    query: '',
  });
  
  const { getSecFilings, isLoading } = usePerplexityResearch();

  const handleSearch = async () => {
    if (!formData.companyName) return;
    
    const data = await getSecFilings({
      companyName: formData.companyName,
      ticker: formData.ticker || undefined,
      filingTypes: formData.filingTypes,
      query: formData.query || undefined,
    });
    
    if (data) {
      setResult(data);
    }
  };

  const toggleFilingType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      filingTypes: prev.filingTypes.includes(type)
        ? prev.filingTypes.filter(t => t !== type)
        : [...prev.filingTypes, type],
    }));
  };

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-lg">SEC Filings Search</CardTitle>
                <Badge variant="secondary" className="text-xs">Perplexity</Badge>
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sec-company">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="sec-company"
                    value={formData.companyName}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Enter company name"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="sec-ticker">Ticker Symbol (optional)</Label>
                <Input
                  id="sec-ticker"
                  value={formData.ticker}
                  onChange={(e) => setFormData(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                  placeholder="e.g., AAPL"
                  className="uppercase"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Filing Types</Label>
              <div className="flex flex-wrap gap-4">
                {FILING_TYPES.map(type => (
                  <div key={type.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`filing-${type.id}`}
                      checked={formData.filingTypes.includes(type.id)}
                      onCheckedChange={() => toggleFilingType(type.id)}
                    />
                    <label
                      htmlFor={`filing-${type.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {type.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sec-query">Specific Question (optional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Textarea
                  id="sec-query"
                  value={formData.query}
                  onChange={(e) => setFormData(prev => ({ ...prev, query: e.target.value }))}
                  placeholder="e.g., What is their current debt level? Any recent acquisitions?"
                  className="pl-9 min-h-[80px]"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleSearch} 
              disabled={isLoading || !formData.companyName}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Searching SEC Filings...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Search SEC Filings
                </>
              )}
            </Button>
            
            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            )}
            
            {result && !isLoading && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Last updated {formatDistanceToNow(new Date(result.timestamp))} ago</span>
                  <Button variant="ghost" size="sm" onClick={handleSearch}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
                
                <ScrollArea className="h-[400px] rounded-md border p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {result.content}
                  </div>
                </ScrollArea>
                
                {result.citations.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Sources</Label>
                    <div className="flex flex-wrap gap-2">
                      {result.citations.slice(0, 5).map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {new URL(url).hostname}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
