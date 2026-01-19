import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Target, 
  ChevronDown, 
  RefreshCw, 
  ExternalLink,
  Building2,
  Briefcase,
  Plus,
  X
} from 'lucide-react';
import { usePerplexityResearch, ResearchResult } from '@/hooks/usePerplexityResearch';
import { formatDistanceToNow } from 'date-fns';

interface CompetitiveIntelPanelProps {
  companyName?: string;
  industry?: string;
  competitors?: string[];
}

export function CompetitiveIntelPanel({
  companyName = '',
  industry = '',
  competitors = [],
}: CompetitiveIntelPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [formData, setFormData] = useState({
    companyName,
    industry,
    competitors: competitors.length ? competitors : [''],
  });
  
  const { getCompetitiveIntel, isLoading } = usePerplexityResearch();

  const handleSearch = async () => {
    if (!formData.companyName) return;
    
    const data = await getCompetitiveIntel({
      companyName: formData.companyName,
      industry: formData.industry,
      competitors: formData.competitors.filter(c => c.trim()),
    });
    
    if (data) {
      setResult(data);
    }
  };

  const addCompetitor = () => {
    setFormData(prev => ({
      ...prev,
      competitors: [...prev.competitors, ''],
    }));
  };

  const removeCompetitor = (index: number) => {
    setFormData(prev => ({
      ...prev,
      competitors: prev.competitors.filter((_, i) => i !== index),
    }));
  };

  const updateCompetitor = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      competitors: prev.competitors.map((c, i) => i === index ? value : c),
    }));
  };

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-lg">Competitive Intelligence</CardTitle>
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
                <Label htmlFor="ci-company">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="ci-company"
                    value={formData.companyName}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Enter company name"
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ci-industry">Industry</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="ci-industry"
                    value={formData.industry}
                    onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    placeholder="e.g., SaaS, Healthcare"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Known Competitors (optional)</Label>
                <Button variant="ghost" size="sm" onClick={addCompetitor}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {formData.competitors.map((comp, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={comp}
                      onChange={(e) => updateCompetitor(idx, e.target.value)}
                      placeholder="Competitor name"
                    />
                    {formData.competitors.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeCompetitor(idx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
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
                  Analyzing Competition...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Analyze Competition
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
