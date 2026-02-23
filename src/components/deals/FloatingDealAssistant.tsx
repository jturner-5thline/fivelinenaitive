import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, ChevronLeft, ChevronRight, Search, ArrowRight, ExternalLink, Shield, BookOpen, Briefcase, X } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import { useAISearch, AISearchResult } from '@/hooks/useAISearch';
import { useFeatureAccess } from '@/hooks/useFeatureFlags';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { MorphingBlob } from '@/components/MorphingBlob';

interface FloatingDealAssistantProps {
  dealId: string;
  dealName?: string;
}

export function FloatingDealAssistant({ dealId, dealName }: FloatingDealAssistantProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('deal');

  // Deal AI state
  const [question, setQuestion] = useState('');
  const { messages, sendMessage, isLoading, clearMessages } = useDealSpaceAI(dealId);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Platform search state
  const [searchValue, setSearchValue] = useState('');
  const { search, result, isSearching, clear, getNavigationPath } = useAISearch();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Feature access
  const { hasAccess: canAccessChatWidget, isLoading: isLoadingAccess } = useFeatureAccess('chat_widget');

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus search input when switching to search tab
  useEffect(() => {
    if (isOpen && activeTab === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, activeTab]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (searchValue.length >= 5) {
      const timer = setTimeout(() => search(searchValue), 300);
      return () => clearTimeout(timer);
    } else {
      clear();
    }
  }, [searchValue, search, clear]);

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || isLoading) return;
    sendMessage(question);
    setQuestion('');
  }, [question, sendMessage, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;
    if (result) {
      const path = getNavigationPath(result);
      if (path) { navigate(path); setIsOpen(false); setSearchValue(''); clear(); }
      return;
    }
    await search(searchValue);
  };

  const handleNavigate = () => {
    if (!result) return;
    const path = getNavigationPath(result);
    if (path) { navigate(path); setIsOpen(false); setSearchValue(''); clear(); }
  };

  const getSourceIcon = (source: string) => {
    if (source.includes('policy') || source.includes('privacy') || source.includes('terms')) return Shield;
    if (source.includes('docs') || source.includes('platform') || source.includes('help')) return BookOpen;
    if (source.includes('data') || source.includes('deals') || source.includes('lenders')) return Briefcase;
    return Sparkles;
  };

  const dealSuggestions = [
    "Are we missing anything?",
    "What are the key terms?",
    "Summarize main risks",
    "Financial highlights?",
  ];

  const searchSuggestions = [
    "Show me deals closing this month",
    "Find stale deals that need attention",
    "Which lenders are most active?",
    "What is the privacy policy?",
  ];

  if (isLoadingAccess || !canAccessChatWidget) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999]">
      {/* MorphingBlob trigger */}
      <MorphingBlob isActive={isOpen} onClick={() => setIsOpen(!isOpen)} />

      {/* Unified panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute bottom-20 right-0 w-[420px] rounded-xl border border-primary/20 shadow-[0_6px_30px_-10px_hsl(var(--primary)/0.2),0_0_40px_-20px_hsl(var(--primary)/0.1)] overflow-hidden animate-scale-in"
          style={{
            background: 'linear-gradient(145deg, hsl(230 25% 10%) 0%, hsl(235 28% 13%) 50%, hsl(245 35% 18%) 80%, hsl(220 50% 22%) 100%)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <div className="p-3 border-b border-primary/10 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, hsl(230 25% 10%) 0%, hsl(230 30% 14%) 50%, hsl(220 45% 20%) 100%)' }}>
            <div className="flex items-center gap-2">
              <img src={naitiveAiIcon} alt="AI" className="h-4 w-4" />
              <span className="text-sm font-semibold">AI Assistant</span>
              {dealName && activeTab === 'deal' && (
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">· {dealName}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeTab === 'deal' && messages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearMessages} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                  Clear
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b border-primary/10 bg-transparent p-0 h-auto">
              <TabsTrigger value="deal" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-xs">
                <img src={naitiveAiIcon} alt="" className="h-3 w-3 mr-1.5" />
                Deal AI
              </TabsTrigger>
              <TabsTrigger value="search" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-xs">
                <Search className="h-3 w-3 mr-1.5" />
                Platform Search
              </TabsTrigger>
            </TabsList>

            {/* Deal AI Tab */}
            <TabsContent value="deal" className="mt-0 flex flex-col">
              {messages.length === 0 && (
                <div className="relative px-4 pt-3 pb-1">
                  <button onClick={() => { const el = document.getElementById('prompt-carousel'); if (el) el.scrollBy({ left: -120, behavior: 'smooth' }); }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <div id="prompt-carousel" className="overflow-x-auto scrollbar-none mx-5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <div className="flex gap-2 min-w-max">
                      {dealSuggestions.map((q, i) => (
                        <Button key={i} variant="outline" size="sm" className="text-xs h-7 whitespace-nowrap shrink-0" onClick={() => setQuestion(q)}>
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => { const el = document.getElementById('prompt-carousel'); if (el) el.scrollBy({ left: 120, behavior: 'smooth' }); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <ScrollArea className="h-[22rem] p-4">
                {messages.length > 0 && (
                  <div className="space-y-4">
                    {messages.map((message, index) => (
                      <div key={index} className={cn("flex flex-col gap-1", message.role === 'user' ? 'items-end' : 'items-start')}>
                        <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                          {message.role === 'assistant' ? (
                            <div className="max-w-none">
                              <ReactMarkdown
                                components={{
                                  h2: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                                  h3: ({ children }) => <h4 className="font-medium text-sm mt-2 mb-1">{children}</h4>,
                                  ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                                  li: ({ children }) => <li className="text-sm">{children}</li>,
                                  p: ({ children }) => <p className="my-1">{children}</p>,
                                  a: ({ href, children }) => {
                                    if (href?.startsWith('#tab-')) {
                                      const tab = href.replace('#tab-', '');
                                      return (
                                        <button className="text-primary underline hover:text-primary/80 transition-colors font-medium"
                                          onClick={() => { setIsOpen(false); const tabTrigger = document.querySelector(`[data-state][value="${tab}"]`) as HTMLElement; tabTrigger?.click(); }}>
                                          {children}
                                        </button>
                                      );
                                    }
                                    if (href === '#open-deal-memo') {
                                      return (
                                        <button className="text-primary underline hover:text-primary/80 transition-colors font-medium"
                                          onClick={() => { setIsOpen(false); const memoBtn = document.querySelector('[data-deal-memo-trigger]') as HTMLElement; memoBtn?.click(); }}>
                                          {children}
                                        </button>
                                      );
                                    }
                                    return <a href={href} className="text-primary underline">{children}</a>;
                                  }
                                }}
                              >
                                {message.content.replace(/([^\n])\n(#{1,3}\s)/g, '$1\n\n$2')}
                              </ReactMarkdown>
                            </div>
                          ) : message.content}
                        </div>
                        {message.sources && message.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {message.sources.map((source, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{source}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex items-start">
                        <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="text-muted-foreground">Thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="p-3 border-t border-primary/10">
                <div className="flex gap-2">
                  <Input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Ask about this deal..." className="flex-1 h-9 text-sm border-primary/20 bg-background/80 focus-visible:ring-primary/30" disabled={isLoading} />
                  <Button variant="gradient" size="sm" onClick={handleSendQuestion} disabled={!question.trim() || isLoading} className="h-9 w-9 p-0 relative overflow-hidden">
                    {question.trim() && !isLoading && (
                      <span className="absolute inset-0 rounded overflow-hidden pointer-events-none">
                        <span className="absolute -inset-full animate-[shimmer_5s_ease-in-out_infinite]" style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)' }} />
                      </span>
                    )}
                    <span className="relative z-10">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </span>
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Platform Search Tab */}
            <TabsContent value="search" className="mt-0 flex flex-col">
              <div className="p-3 border-b border-primary/10">
                <form onSubmit={handleSearchSubmit}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input ref={searchInputRef} placeholder="Search deals, lenders, or ask a question..."
                      value={searchValue} onChange={(e) => setSearchValue(e.target.value)} className="pl-10 pr-10 h-9 text-sm" />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </form>
              </div>

              <ScrollArea className="h-[22rem]">
                <div className="p-4">
                  {isSearching ? (
                    <div className="flex items-center justify-center gap-2 py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Searching...</span>
                    </div>
                  ) : result ? (
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-3 flex-1">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
                          {result.sources && result.sources.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {result.sources.map((source, i) => {
                                const Icon = getSourceIcon(source);
                                return <Badge key={i} variant="outline" className="text-xs gap-1"><Icon className="h-3 w-3" />{source}</Badge>;
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      {result.navigation && (
                        <Button variant="outline" size="sm" className="w-full justify-between" onClick={handleNavigate}>
                          <span className="flex items-center gap-2"><ArrowRight className="h-4 w-4" />Go to {result.navigation.description}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                      {result.suggestedActions && result.suggestedActions.length > 0 && (
                        <div className="border-t border-border pt-3">
                          <p className="text-xs text-muted-foreground mb-2">Related questions:</p>
                          <div className="flex flex-wrap gap-1">
                            {result.suggestedActions.slice(0, 3).map((action, i) => (
                              <Badge key={i} variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80" onClick={() => setSearchValue(action)}>
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
                        {searchSuggestions.map((s, i) => (
                          <Badge key={i} variant="outline" className="cursor-pointer hover:bg-accent text-xs" onClick={() => setSearchValue(s)}>
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>,
    document.body
  );
}
