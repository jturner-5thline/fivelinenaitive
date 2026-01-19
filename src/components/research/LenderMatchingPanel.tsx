import { useState, useMemo } from 'react';
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
  Sparkles, 
  ChevronDown, 
  RefreshCw, 
  ExternalLink,
  Building2,
  MapPin,
  DollarSign,
  Briefcase
} from 'lucide-react';
import { usePerplexityResearch, ResearchResult } from '@/hooks/usePerplexityResearch';
import { formatDistanceToNow } from 'date-fns';

interface LenderMatchingPanelProps {
  companyName?: string;
  industry?: string;
  dealValue?: number;
  dealType?: string;
  location?: string;
  existingLenders?: string[];
}

export function LenderMatchingPanel({
  companyName = '',
  industry = '',
  dealValue = 0,
  dealType = '',
  location = '',
  existingLenders = [],
}: LenderMatchingPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [formData, setFormData] = useState({
    companyName,
    industry,
    dealValue,
    dealType: dealType || 'Debt financing',
    location,
    revenueRange: '',
  });
  
  const { getLenderMatching, isLoading } = usePerplexityResearch();

  const handleSearch = async () => {
    if (!formData.companyName || !formData.industry) return;
    
    const data = await getLenderMatching({
      companyName: formData.companyName,
      industry: formData.industry,
      dealValue: formData.dealValue,
      dealType: formData.dealType,
      location: formData.location,
      revenueRange: formData.revenueRange,
      existingLenders,
    });
    
    if (data) {
      setResult(data);
    }
  };

  const handleRefresh = () => handleSearch();

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">AI Lender Matching</CardTitle>
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
                <Label htmlFor="company">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company"
                    value={formData.companyName}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Enter company name"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    placeholder="e.g., SaaS, Healthcare"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dealValue">Deal Size</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="dealValue"
                    type="number"
                    value={formData.dealValue || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, dealValue: Number(e.target.value) }))}
                    placeholder="e.g., 5000000"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dealType">Deal Type</Label>
                <Select
                  value={formData.dealType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dealType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select deal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Debt financing">Debt Financing</SelectItem>
                    <SelectItem value="Asset-based lending">Asset-Based Lending</SelectItem>
                    <SelectItem value="Revenue-based financing">Revenue-Based Financing</SelectItem>
                    <SelectItem value="Venture debt">Venture Debt</SelectItem>
                    <SelectItem value="Equipment financing">Equipment Financing</SelectItem>
                    <SelectItem value="Working capital">Working Capital</SelectItem>
                    <SelectItem value="Acquisition financing">Acquisition Financing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g., New York, USA"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="revenue">Revenue Range</Label>
                <Select
                  value={formData.revenueRange}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, revenueRange: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="$0-1M">$0 - $1M</SelectItem>
                    <SelectItem value="$1-5M">$1M - $5M</SelectItem>
                    <SelectItem value="$5-10M">$5M - $10M</SelectItem>
                    <SelectItem value="$10-25M">$10M - $25M</SelectItem>
                    <SelectItem value="$25-50M">$25M - $50M</SelectItem>
                    <SelectItem value="$50-100M">$50M - $100M</SelectItem>
                    <SelectItem value="$100M+">$100M+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button 
              onClick={handleSearch} 
              disabled={isLoading || !formData.companyName || !formData.industry}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Finding Lenders...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Find Matching Lenders
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
                  <Button variant="ghost" size="sm" onClick={handleRefresh}>
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
