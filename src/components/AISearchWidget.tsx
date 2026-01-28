import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Loader2, ArrowRight, ExternalLink, Shield, BookOpen, Briefcase, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAISearch, AISearchResult } from '@/hooks/useAISearch';
import { cn } from '@/lib/utils';

const aiSuggestions = [
  "Show me deals closing this month",
  "Find stale deals that need attention",
  "Which lenders are most active?",
  "What is the privacy policy?",
];

export function AISearchWidget() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { search, result, isSearching, clear, getNavigationPath } = useAISearch();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        clear();
        setInputValue('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, clear]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (inputValue.length >= 5) {
      const timer = setTimeout(() => {
        search(inputValue);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      clear();
    }
  }, [inputValue, search, clear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    if (result) {
      const path = getNavigationPath(result);
      if (path) {
        navigate(path);
        handleClose();
      }
      return;
    }
    
    await search(inputValue);
  };

  const handleNavigate = () => {
    if (!result) return;
    const path = getNavigationPath(result);
    if (path) {
      navigate(path);
      handleClose();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setInputValue('');
    clear();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
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
    <div className="fixed bottom-4 left-4 z-50">
      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className={cn(
          "h-12 w-12 rounded-full shadow-lg transition-all duration-200",
          "bg-primary hover:bg-primary/90 hover:scale-105",
          isOpen && "scale-95"
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Search className="h-5 w-5" />
        )}
      </Button>

      {/* Search Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute bottom-16 left-0 w-[380px] bg-card border border-border rounded-xl shadow-xl animate-scale-in"
        >
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Search</span>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  placeholder="Search deals, lenders, or ask a question..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="pl-10 pr-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </form>
          </div>

          {/* Content */}
          <ScrollArea className="max-h-[350px]">
            <div className="p-4">
              {isSearching ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Searching...</span>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  {/* AI Answer */}
                  <div className="flex gap-3">
                    <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-3 flex-1">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {result.answer}
                      </p>
                      
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
                    <div className="border-t border-border pt-3">
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
              ) : (
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
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
