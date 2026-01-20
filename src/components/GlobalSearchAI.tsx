import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, Briefcase, Users, FileText, Settings, Lightbulb, BarChart3,
  Sparkles, Loader2, TrendingUp, Target, Scale, Building2, Bell, Calendar,
  HelpCircle, BookOpen, Shield, ExternalLink, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useDealsContext } from "@/contexts/DealsContext";
import { useLenders } from "@/contexts/LendersContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const quickActions = [
  { name: "Dashboard", icon: Briefcase, path: "/dashboard" },
  { name: "Deals", icon: Briefcase, path: "/deals" },
  { name: "Lenders", icon: Building2, path: "/lenders" },
  { name: "Analytics", icon: BarChart3, path: "/analytics" },
  { name: "Metrics", icon: TrendingUp, path: "/metrics" },
  { name: "Insights", icon: Lightbulb, path: "/insights" },
  { name: "Research", icon: Sparkles, path: "/research" },
  { name: "Reports", icon: FileText, path: "/reports" },
  { name: "Notifications", icon: Bell, path: "/notifications" },
  { name: "Settings", icon: Settings, path: "/settings" },
  { name: "Help", icon: HelpCircle, path: "/help" },
];

const aiSuggestions = [
  { query: "How do I create a new deal?", icon: HelpCircle },
  { query: "Show me deals closing this month", icon: Calendar },
  { query: "What is the privacy policy?", icon: Shield },
  { query: "Find stale deals that need attention", icon: Target },
  { query: "How do I invite team members?", icon: Users },
  { query: "Which lenders are most active?", icon: Building2 },
];

interface AISearchResult {
  type: 'answer' | 'navigation' | 'data_query' | 'help';
  answer: string;
  dataTypes: string[];
  filters: Record<string, string | null>;
  navigation?: { page: string; description: string } | null;
  suggestedActions: string[];
  sources: string[];
  originalQuery: string;
}

export function GlobalSearchAI() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isAISearching, setIsAISearching] = useState(false);
  const [aiResult, setAIResult] = useState<AISearchResult | null>(null);
  const navigate = useNavigate();
  const { deals } = useDealsContext();
  const { lenders } = useLenders();
  const { user } = useAuth();

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((path: string) => {
    setOpen(false);
    setQuery("");
    setAIResult(null);
    navigate(path);
  }, [navigate]);

  const handleAISearch = useCallback(async () => {
    if (!query.trim() || query.length < 3) return;
    
    setIsAISearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('universal-search', {
        body: { 
          query: query.trim(),
          userId: user?.id,
        },
      });

      if (error) {
        if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
          toast.error("Too many requests. Please wait a moment.");
        } else if (error.message?.includes('402')) {
          toast.error("AI credits exhausted. Please contact your administrator.");
        } else {
          throw error;
        }
        return;
      }
      setAIResult(data);
    } catch (err) {
      console.error('AI search error:', err);
      toast.error("Search failed. Please try again.");
    } finally {
      setIsAISearching(false);
    }
  }, [query, user?.id]);

  // Debounced AI search
  useEffect(() => {
    if (query.length >= 8) {
      const timer = setTimeout(handleAISearch, 600);
      return () => clearTimeout(timer);
    } else {
      setAIResult(null);
    }
  }, [query, handleAISearch]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  };

  const getNavigationFromAI = (result: AISearchResult): string | null => {
    if (result.navigation?.page) {
      return result.navigation.page;
    }
    
    const dataType = result.dataTypes[0];
    const filters = result.filters;
    
    switch (dataType) {
      case 'deals':
        const dealsUrl = new URL('/deals', window.location.origin);
        if (filters.stage) dealsUrl.searchParams.set('stage', filters.stage);
        if (filters.status) dealsUrl.searchParams.set('status', filters.status);
        if (filters.keyword) dealsUrl.searchParams.set('search', filters.keyword);
        return dealsUrl.pathname + dealsUrl.search;
      case 'lenders':
        return filters.keyword ? `/lenders?search=${encodeURIComponent(filters.keyword)}` : '/lenders';
      case 'analytics':
        return '/analytics';
      case 'insights':
        return '/insights';
      case 'activities':
        return '/notifications';
      case 'reports':
        return '/reports';
      case 'help':
      case 'documentation':
        return '/help';
      case 'privacy':
        return '/privacy';
      case 'terms':
        return '/terms';
      default:
        return null;
    }
  };

  const handleAIResultClick = () => {
    if (!aiResult) return;
    const path = getNavigationFromAI(aiResult);
    if (path) {
      handleSelect(path);
    }
  };

  const getSourceIcon = (source: string) => {
    if (source.includes('policy') || source.includes('privacy') || source.includes('terms')) {
      return Shield;
    }
    if (source.includes('docs') || source.includes('platform') || source.includes('help')) {
      return BookOpen;
    }
    if (source.includes('data') || source.includes('deals') || source.includes('lenders')) {
      return Briefcase;
    }
    return Sparkles;
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-48 lg:w-80"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="mr-2 h-4 w-4 text-primary" />
        <span className="hidden lg:inline-flex">Describe what you want to accomplish...</span>
        <span className="inline-flex lg:hidden">Ask AI</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.4rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setQuery("");
          setAIResult(null);
        }
      }}>
        <CommandInput 
          placeholder="Describe what you want to accomplish..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[500px]">
          <CommandEmpty>
            {isAISearching ? (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Understanding your question...</span>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p>No results found.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try asking about deals, lenders, how to use features, or policies
                </p>
              </div>
            )}
          </CommandEmpty>

          {/* AI Answer Result */}
          {aiResult && !isAISearching && (
            <>
              <CommandGroup heading="AI Answer">
                <div className="px-2 py-3 space-y-3">
                  {/* Main Answer */}
                  <div className="flex gap-3">
                    <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <ScrollArea className="max-h-[200px]">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {aiResult.answer}
                        </p>
                      </ScrollArea>
                      
                      {/* Sources */}
                      {aiResult.sources && aiResult.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {aiResult.sources.map((source, i) => {
                            const Icon = getSourceIcon(source);
                            return (
                              <Badge key={i} variant="outline" className="text-xs gap-1">
                                <Icon className="h-3 w-3" />
                                {source}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Navigation suggestion */}
                  {aiResult.navigation && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between"
                      onClick={handleAIResultClick}
                    >
                      <span className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4" />
                        Go to {aiResult.navigation.description}
                      </span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Suggested Actions */}
                  {aiResult.suggestedActions && aiResult.suggestedActions.length > 0 && (
                    <div className="border-t pt-2">
                      <p className="text-xs text-muted-foreground mb-1">Related actions:</p>
                      <div className="flex flex-wrap gap-1">
                        {aiResult.suggestedActions.slice(0, 3).map((action, i) => (
                          <Badge 
                            key={i} 
                            variant="secondary" 
                            className="text-xs cursor-pointer hover:bg-secondary/80"
                            onClick={() => setQuery(action)}
                          >
                            {action}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Quick Actions */}
          {!query && (
            <>
              <CommandGroup heading="Quick Actions">
                {quickActions.slice(0, 6).map((action) => (
                  <CommandItem
                    key={action.path}
                    value={action.name}
                    onSelect={() => handleSelect(action.path)}
                  >
                    <action.icon className="mr-2 h-4 w-4" />
                    <span>{action.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Try asking...">
                {aiSuggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.query}
                    value={suggestion.query}
                    onSelect={() => setQuery(suggestion.query)}
                  >
                    <suggestion.icon className="mr-2 h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">{suggestion.query}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Deals */}
          {deals && deals.length > 0 && query && !aiResult && (
            <CommandGroup heading="Deals">
              {deals
                .filter(d => d.company.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 5)
                .map((deal) => (
                  <CommandItem
                    key={deal.id}
                    value={`deal ${deal.company} ${deal.stage}`}
                    onSelect={() => handleSelect(`/deal/${deal.id}`)}
                  >
                    <Briefcase className="mr-2 h-4 w-4" />
                    <div className="flex flex-1 items-center justify-between">
                      <span>{deal.company}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(deal.value)} • {deal.stage}
                      </span>
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          )}

          {/* Lenders */}
          {lenders && lenders.length > 0 && query && !aiResult && (
            <CommandGroup heading="Lenders">
              {lenders
                .filter(l => l.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 5)
                .map((lender) => (
                  <CommandItem
                    key={lender.name}
                    value={`lender ${lender.name} ${lender.contact?.name || ""}`}
                    onSelect={() => handleSelect(`/lenders?search=${encodeURIComponent(lender.name)}`)}
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <div className="flex flex-1 items-center justify-between">
                      <span>{lender.name}</span>
                      {lender.contact?.name && (
                        <span className="text-xs text-muted-foreground">
                          {lender.contact.name}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          )}

          {/* More Navigation */}
          {query && !aiResult && (
            <CommandGroup heading="Pages">
              {quickActions
                .filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
                .map((action) => (
                  <CommandItem
                    key={action.path}
                    value={action.name}
                    onSelect={() => handleSelect(action.path)}
                  >
                    <action.icon className="mr-2 h-4 w-4" />
                    <span>{action.name}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
