import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, Briefcase, Users, FileText, Settings, Lightbulb, BarChart3,
  Sparkles, Loader2, TrendingUp, Target, Scale, Building2, Bell, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
];

const aiSuggestions = [
  { query: "Show me deals closing this month", icon: Calendar },
  { query: "Find stale deals that need attention", icon: Target },
  { query: "Which lenders are most active?", icon: Users },
  { query: "Compare my pipeline to last quarter", icon: TrendingUp },
  { query: "Find deals over $10M in SaaS", icon: Briefcase },
  { query: "Show term sheet benchmarks", icon: Scale },
];

interface AISearchResult {
  intent: string;
  dataTypes: string[];
  filters: Record<string, string | null>;
  suggestedQuery: string;
  explanation: string;
  suggestedActions: string[];
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

      if (error) throw error;
      setAIResult(data);
    } catch (err) {
      console.error('AI search error:', err);
    } finally {
      setIsAISearching(false);
    }
  }, [query, user?.id]);

  // Debounced AI search
  useEffect(() => {
    if (query.length >= 10) {
      const timer = setTimeout(handleAISearch, 800);
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

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-48 lg:w-80"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="mr-2 h-4 w-4 text-primary" />
        <span className="hidden lg:inline-flex">Ask anything or search...</span>
        <span className="inline-flex lg:hidden">Search</span>
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
          placeholder="Describe what you're looking for..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[500px]">
          <CommandEmpty>
            {isAISearching ? (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Understanding your request...</span>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p>No results found.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try describing what you want to find or do
                </p>
              </div>
            )}
          </CommandEmpty>

          {/* AI Search Result */}
          {aiResult && !isAISearching && (
            <>
              <CommandGroup heading="AI Understanding">
                <CommandItem 
                  onSelect={handleAIResultClick}
                  className="flex flex-col items-start gap-2 py-3"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium">{aiResult.explanation}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 ml-6">
                    {aiResult.dataTypes.map((type) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                    {Object.entries(aiResult.filters).map(([key, value]) => 
                      value && (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      )
                    )}
                  </div>
                  {aiResult.suggestedActions.length > 0 && (
                    <div className="text-xs text-muted-foreground ml-6">
                      Try: {aiResult.suggestedActions.slice(0, 2).join(' • ')}
                    </div>
                  )}
                </CommandItem>
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
                {aiSuggestions.slice(0, 4).map((suggestion) => (
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
          {deals && deals.length > 0 && (
            <CommandGroup heading="Deals">
              {deals
                .filter(d => !query || d.company.toLowerCase().includes(query.toLowerCase()))
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

          <CommandSeparator />

          {/* Lenders */}
          {lenders && lenders.length > 0 && (
            <CommandGroup heading="Lenders">
              {lenders
                .filter(l => !query || l.name.toLowerCase().includes(query.toLowerCase()))
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
          {query && (
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
