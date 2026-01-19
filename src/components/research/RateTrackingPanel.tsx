import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  TrendingUp, 
  ChevronDown, 
  RefreshCw, 
  ExternalLink
} from 'lucide-react';
import { usePerplexityResearch, ResearchResult } from '@/hooks/usePerplexityResearch';
import { formatDistanceToNow } from 'date-fns';

export function RateTrackingPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [formData, setFormData] = useState({
    loanType: '',
    dealSize: '',
    creditQuality: '',
  });
  
  const { getRateTracking, isLoading } = usePerplexityResearch();

  const handleSearch = async () => {
    const data = await getRateTracking({
      loanType: formData.loanType || undefined,
      dealSize: formData.dealSize || undefined,
      creditQuality: formData.creditQuality || undefined,
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
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                <CardTitle className="text-lg">Rate Tracking</CardTitle>
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
                <Label>Loan Type</Label>
                <Select
                  value={formData.loanType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, loanType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Types</SelectItem>
                    <SelectItem value="Senior secured">Senior Secured</SelectItem>
                    <SelectItem value="Revolver">Revolving Credit</SelectItem>
                    <SelectItem value="ABL">Asset-Based Lending</SelectItem>
                    <SelectItem value="Venture debt">Venture Debt</SelectItem>
                    <SelectItem value="Mezzanine">Mezzanine</SelectItem>
                    <SelectItem value="Revenue-based">Revenue-Based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Deal Size</Label>
                <Select
                  value={formData.dealSize}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dealSize: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sizes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Sizes</SelectItem>
                    <SelectItem value="$1-10M">$1M - $10M</SelectItem>
                    <SelectItem value="$10-25M">$10M - $25M</SelectItem>
                    <SelectItem value="$25-50M">$25M - $50M</SelectItem>
                    <SelectItem value="$50-100M">$50M - $100M</SelectItem>
                    <SelectItem value="$100M+">$100M+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Credit Quality</Label>
                <Select
                  value={formData.creditQuality}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, creditQuality: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All ratings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Ratings</SelectItem>
                    <SelectItem value="Investment grade">Investment Grade</SelectItem>
                    <SelectItem value="Sub-investment grade">Sub-Investment Grade</SelectItem>
                    <SelectItem value="Middle market">Middle Market</SelectItem>
                    <SelectItem value="Small business">Small Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button 
              onClick={handleSearch} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Fetching Rates...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Get Current Rates
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
