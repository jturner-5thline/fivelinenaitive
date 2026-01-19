import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  BarChart3, 
  ChevronDown, 
  RefreshCw, 
  ExternalLink,
  Globe,
  Briefcase
} from 'lucide-react';
import { usePerplexityResearch, ResearchResult } from '@/hooks/usePerplexityResearch';
import { formatDistanceToNow } from 'date-fns';

interface MarketSizingPanelProps {
  industry?: string;
}

export function MarketSizingPanel({
  industry = '',
}: MarketSizingPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [formData, setFormData] = useState({
    industry,
    subSegment: '',
    geography: 'Global',
  });
  
  const { getMarketSizing, isLoading } = usePerplexityResearch();

  const handleSearch = async () => {
    if (!formData.industry) return;
    
    const data = await getMarketSizing({
      industry: formData.industry,
      subSegment: formData.subSegment,
      geography: formData.geography,
    });
    
    if (data) {
      setResult(data);
    }
  };

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-lg">Market Sizing</CardTitle>
                <Badge variant="secondary" className="text-xs">Perplexity</Badge>
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ms-industry">Industry</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="ms-industry"
                    value={formData.industry}
                    onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    placeholder="e.g., SaaS, Healthcare"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ms-segment">Sub-Segment (optional)</Label>
                <Input
                  id="ms-segment"
                  value={formData.subSegment}
                  onChange={(e) => setFormData(prev => ({ ...prev, subSegment: e.target.value }))}
                  placeholder="e.g., HR Tech, Fintech"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ms-geo">Geography</Label>
                <Select
                  value={formData.geography}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, geography: value }))}
                >
                  <SelectTrigger>
                    <Globe className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Global">Global</SelectItem>
                    <SelectItem value="North America">North America</SelectItem>
                    <SelectItem value="United States">United States</SelectItem>
                    <SelectItem value="Europe">Europe</SelectItem>
                    <SelectItem value="Asia Pacific">Asia Pacific</SelectItem>
                    <SelectItem value="Latin America">Latin America</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button 
              onClick={handleSearch} 
              disabled={isLoading || !formData.industry}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing Market...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Get Market Analysis
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
