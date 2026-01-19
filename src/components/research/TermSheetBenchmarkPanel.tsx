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
  Scale, 
  ChevronDown, 
  RefreshCw, 
  ExternalLink,
  DollarSign,
  Briefcase,
  Percent
} from 'lucide-react';
import { usePerplexityResearch, ResearchResult } from '@/hooks/usePerplexityResearch';
import { formatDistanceToNow } from 'date-fns';

interface TermSheetBenchmarkPanelProps {
  dealType?: string;
  dealSize?: number;
  industry?: string;
}

export function TermSheetBenchmarkPanel({
  dealType = '',
  dealSize = 0,
  industry = '',
}: TermSheetBenchmarkPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [formData, setFormData] = useState({
    dealType: dealType || 'Senior secured term loan',
    dealSize,
    industry,
    proposedRate: '',
    proposedTerm: '',
  });
  
  const { getTermSheetBenchmark, isLoading } = usePerplexityResearch();

  const handleSearch = async () => {
    if (!formData.dealType || !formData.industry) return;
    
    const data = await getTermSheetBenchmark({
      dealType: formData.dealType,
      dealSize: formData.dealSize,
      industry: formData.industry,
      proposedRate: formData.proposedRate ? Number(formData.proposedRate) : undefined,
      proposedTerm: formData.proposedTerm || undefined,
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
                <Scale className="h-5 w-5 text-green-500" />
                <CardTitle className="text-lg">Term Sheet Benchmarking</CardTitle>
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
                <Label htmlFor="tsb-type">Deal Type</Label>
                <Select
                  value={formData.dealType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dealType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select deal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Senior secured term loan">Senior Secured Term Loan</SelectItem>
                    <SelectItem value="Revolving credit facility">Revolving Credit Facility</SelectItem>
                    <SelectItem value="Asset-based loan">Asset-Based Loan</SelectItem>
                    <SelectItem value="Mezzanine debt">Mezzanine Debt</SelectItem>
                    <SelectItem value="Venture debt">Venture Debt</SelectItem>
                    <SelectItem value="Revenue-based financing">Revenue-Based Financing</SelectItem>
                    <SelectItem value="Equipment financing">Equipment Financing</SelectItem>
                    <SelectItem value="Unitranche">Unitranche</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tsb-size">Deal Size</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="tsb-size"
                    type="number"
                    value={formData.dealSize || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, dealSize: Number(e.target.value) }))}
                    placeholder="e.g., 10000000"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tsb-industry">Industry</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="tsb-industry"
                    value={formData.industry}
                    onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    placeholder="e.g., SaaS, Manufacturing"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tsb-rate">Proposed Rate % (optional)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="tsb-rate"
                    type="number"
                    step="0.1"
                    value={formData.proposedRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, proposedRate: e.target.value }))}
                    placeholder="e.g., 8.5"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="col-span-2 space-y-2">
                <Label htmlFor="tsb-term">Proposed Term (optional)</Label>
                <Input
                  id="tsb-term"
                  value={formData.proposedTerm}
                  onChange={(e) => setFormData(prev => ({ ...prev, proposedTerm: e.target.value }))}
                  placeholder="e.g., 5 years, 36 months"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleSearch} 
              disabled={isLoading || !formData.dealType || !formData.industry}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Benchmarking Terms...
                </>
              ) : (
                <>
                  <Scale className="h-4 w-4 mr-2" />
                  Benchmark Terms
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
