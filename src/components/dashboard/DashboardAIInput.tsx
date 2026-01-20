import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Plus, Globe, Sparkles, Loader2, ArrowRight, ExternalLink, Shield, BookOpen, Briefcase } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAISearch, AISearchResult } from '@/hooks/useAISearch';

const aiSuggestions = [
  "How do I create a new deal?",
  "Show me deals closing this month",
  "What is the privacy policy?",
  "Find stale deals that need attention",
  "How do I invite team members?",
  "Which lenders are most active?",
];

export function DashboardAIInput() {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { search, result, isSearching, clear, getNavigationPath } = useAISearch();
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (inputValue.length >= 8) {
      const timer = setTimeout(() => {
        search(inputValue);
        setShowResults(true);
      }, 600);
      return () => clearTimeout(timer);
    } else {
      clear();
      if (inputValue.length === 0) {
        setShowResults(false);
      }
    }
  }, [inputValue, search, clear]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    // If we already have a result, use its navigation
    if (result) {
      const path = getNavigationPath(result);
      if (path) {
        navigate(path);
        setInputValue('');
        clear();
        setShowResults(false);
      }
      return;
    }
    
    // Otherwise trigger a search
    const searchResult = await search(inputValue);
    if (searchResult) {
      setShowResults(true);
    }
  };

  const handleNavigate = () => {
    if (!result) return;
    const path = getNavigationPath(result);
    if (path) {
      navigate(path);
      setInputValue('');
      clear();
      setShowResults(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    setShowResults(true);
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
    <div className="relative">
      <Card className="p-4 shadow-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <Input
              ref={inputRef}
              placeholder="Describe what you want to accomplish..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => inputValue.length > 0 && setShowResults(true)}
              className="pl-10 border-0 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
              <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-accent">
                <Globe className="h-3.5 w-3.5" />
                Website
              </Badge>
            </div>
            <Button 
              type="submit" 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80"
              disabled={isSearching}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>

      {/* AI Results Panel */}
      {showResults && (result || isSearching || inputValue.length === 0) && (
        <Card 
          ref={resultsRef}
          className="absolute top-full left-0 right-0 mt-2 p-4 shadow-xl z-50 max-h-[400px] overflow-hidden"
        >
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Understanding your question...</span>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* AI Answer */}
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-3 flex-1">
                  <ScrollArea className="max-h-[180px]">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {result.answer}
                    </p>
                  </ScrollArea>
                  
                  {/* Sources */}
                  {result.sources && result.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {result.sources.map((source, i) => {
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
              {result.navigation && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  onClick={handleNavigate}
                >
                  <span className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Go to {result.navigation.description}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}

              {/* Suggested Actions */}
              {result.suggestedActions && result.suggestedActions.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Related questions:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.suggestedActions.slice(0, 3).map((action, i) => (
                      <Badge 
                        key={i} 
                        variant="secondary" 
                        className="text-xs cursor-pointer hover:bg-secondary/80"
                        onClick={() => handleSuggestionClick(action)}
                      >
                        {action}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : inputValue.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Try asking...</p>
              <div className="flex flex-wrap gap-2">
                {aiSuggestions.map((suggestion, i) => (
                  <Badge 
                    key={i}
                    variant="outline" 
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
