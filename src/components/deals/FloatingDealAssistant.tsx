import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, ChevronLeft, ChevronRight, Search, ArrowRight, ExternalLink, Shield, BookOpen, Briefcase, X, Check, XCircle } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSidebar } from '@/components/ui/sidebar';
import { useDealAssistant, type Message, type DealAction } from '@/hooks/useDealAssistant';
import { useAISearch } from '@/hooks/useAISearch';
import { useFeatureAccess } from '@/hooks/useFeatureFlags';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';

interface FloatingDealAssistantProps {
  dealId: string;
  dealName?: string;
  dealValue?: number;
  dealStage?: string;
  dealStatus?: string;
  dealManager?: string;
  dealNotes?: string;
}

function ActionConfirmationCard({
  action,
  onConfirm,
  onCancel,
  status,
  isExecuting,
}: {
  action: DealAction;
  onConfirm: () => void;
  onCancel: () => void;
  status?: 'pending' | 'confirmed' | 'cancelled';
  isExecuting: boolean;
}) {
  const isResolved = status === 'confirmed' || status === 'cancelled';

  return (
    <div className={cn(
      "rounded-lg border p-3 mt-2 text-sm",
      status === 'confirmed' && "border-green-500/30 bg-green-500/5",
      status === 'cancelled' && "border-muted bg-muted/30 opacity-60",
      status === 'pending' && "border-primary/30 bg-primary/5",
    )}>
      <div className="flex items-start gap-2">
        <div className={cn(
          "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0",
          status === 'confirmed' ? "bg-green-500/20 text-green-500" :
          status === 'cancelled' ? "bg-muted text-muted-foreground" :
          "bg-primary/20 text-primary"
        )}>
          {status === 'confirmed' ? <Check className="h-3 w-3" /> :
           status === 'cancelled' ? <XCircle className="h-3 w-3" /> :
           <ArrowRight className="h-3 w-3" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs">{action.label}</p>
          {action.currentValue && action.newValue && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="line-through">{action.currentValue}</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="font-medium text-foreground">{action.newValue}</span>
            </div>
          )}
          {action.description && !action.currentValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
          )}
        </div>
      </div>
      {!isResolved && (
        <div className="flex gap-2 mt-2.5 ml-7">
          <Button
            size="sm"
            className="h-7 text-xs px-3 gap-1"
            onClick={onConfirm}
            disabled={isExecuting}
          >
            {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-3 gap-1"
            onClick={onCancel}
            disabled={isExecuting}
          >
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export function FloatingDealAssistant({
  dealId,
  dealName,
  dealValue = 0,
  dealStage = '',
  dealStatus = '',
  dealManager = '',
  dealNotes = '',
}: FloatingDealAssistantProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('deal');

  // Deal AI state with operations support
  const [question, setQuestion] = useState('');
  const { messages, sendMessage, isLoading, isExecuting, executeAction, cancelAction, clearMessages } = useDealAssistant();
  const { state: sidebarState, isHovering } = useSidebar();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Platform search state
  const [searchValue, setSearchValue] = useState('');
  const { search, result, isSearching, clear, getNavigationPath } = useAISearch();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Feature access
  const { hasAccess: canAccessChatWidget, isLoading: isLoadingAccess } = useFeatureAccess('chat_widget');

  const isEffectivelyExpanded = sidebarState === 'expanded' || isHovering;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && activeTab === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, activeTab]);

  // Debounced search
  useEffect(() => {
    if (searchValue.length >= 5) {
      const timer = setTimeout(() => search(searchValue), 300);
      return () => clearTimeout(timer);
    } else {
      clear();
    }
  }, [searchValue, search, clear]);

  const dealContext = {
    id: dealId,
    company: dealName || 'Unknown Deal',
    value: dealValue,
    stage: dealStage,
    status: dealStatus,
    manager: dealManager,
    notes: dealNotes,
  };

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || isLoading) return;
    sendMessage(question, dealContext);
    setQuestion('');
  }, [question, sendMessage, isLoading, dealContext]);

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
    "Deal status overview",
    "List all lenders",
    "Outstanding items?",
    "Move to next stage",
  ];

  const searchSuggestions = [
    "Show me deals closing this month",
    "Find stale deals that need attention",
    "Which lenders are most active?",
    "What is the privacy policy?",
  ];

  if (isLoadingAccess || !canAccessChatWidget) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes slide-up-fade {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slide-down-fade {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(20px) scale(0.97); }
        }
      `}</style>
      <div className="fixed bottom-6 right-16 z-[9999] group transition-all duration-300" title="naitive Assistant — Deal operations & search">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Button
                size="sm"
                className={cn(
                  "relative rounded-full h-12 min-w-12 shadow-lg animate-fade-in transition-all duration-300 overflow-visible flex items-center justify-center border-0",
                  isOpen ? "px-4" : "px-0 group-hover:px-4"
                )}
                style={{
                  background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
                }}
              >
                <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                  <span
                    className="absolute -inset-full animate-[shimmer_5s_ease-in-out_infinite]"
                    style={{
                      background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)',
                    }}
                  />
                </span>
                <div className="flex items-center justify-center relative z-10">
                  <img
                    src={naitiveAiIcon}
                    alt="AI"
                    className="h-7 w-7 shrink-0 brightness-0 invert"
                  />
                  <span className={cn(
                    "overflow-hidden whitespace-nowrap transition-all duration-300",
                    isOpen ? "max-w-32 ml-2" : "max-w-0 group-hover:max-w-32 group-hover:ml-2"
                  )}>
                    naitive Assistant
                  </span>
                </div>
              </Button>
            </div>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-[420px] p-0 border-primary/20 overflow-hidden shadow-[0_6px_30px_-10px_hsl(var(--primary)/0.2),0_0_40px_-20px_hsl(var(--primary)/0.1)] data-[state=open]:animate-[slide-up-fade_0.35s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[slide-down-fade_0.2s_ease-in]"
            sideOffset={8}
            style={{
              background: 'linear-gradient(145deg, hsl(230 25% 10%) 0%, hsl(235 28% 13%) 50%, hsl(245 35% 18%) 80%, hsl(220 50% 22%) 100%)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Header */}
            <div className="p-3 border-b border-primary/10 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, hsl(230 25% 10%) 0%, hsl(230 30% 14%) 50%, hsl(220 45% 20%) 100%)' }}>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <img src={naitiveAiIcon} alt="AI" className="h-4 w-4" />
                  naitive Assistant
                </h3>
                {dealName && activeTab === 'deal' && (
                  <p className="text-xs text-muted-foreground mt-0.5">{dealName}</p>
                )}
                {activeTab === 'search' && (
                  <p className="text-xs text-muted-foreground mt-0.5">Search across the platform</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {activeTab === 'deal' && messages.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearMessages} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
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
                    <button
                      onClick={() => { const el = document.getElementById('deal-prompt-carousel'); if (el) el.scrollBy({ left: -120, behavior: 'smooth' }); }}
                      className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <div id="deal-prompt-carousel" className="overflow-x-auto scrollbar-none mx-5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      <div className="flex gap-2 min-w-max">
                        {dealSuggestions.map((q, i) => (
                          <Button key={i} variant="outline" size="sm" className="text-xs h-7 whitespace-nowrap shrink-0" onClick={() => setQuestion(q)}>
                            {q}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => { const el = document.getElementById('deal-prompt-carousel'); if (el) el.scrollBy({ left: 120, behavior: 'smooth' }); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <ScrollArea className="h-[22.5rem] p-4">
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
                                  {(typeof message.content === 'string' ? message.content : '').replace(/([^\n])\n(#{1,3}\s)/g, '$1\n\n$2')}
                                </ReactMarkdown>
                                {/* Action Confirmation Cards */}
                                {message.actions && message.actions.map((action) => (
                                  <ActionConfirmationCard
                                    key={action.id}
                                    action={action}
                                    status={message.actionStatus}
                                    isExecuting={isExecuting}
                                    onConfirm={() => executeAction(index, action.id)}
                                    onCancel={() => cancelAction(index)}
                                  />
                                ))}
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
                      placeholder="Ask or command: 'Move to Submitted to Lenders'..."
                      className="flex-1 h-9 text-sm border-primary/20 bg-background/80 focus-visible:ring-primary/30" disabled={isLoading || isExecuting} />
                    <Button variant="gradient" size="sm" onClick={handleSendQuestion} disabled={!question.trim() || isLoading || isExecuting} className="h-9 w-9 p-0 relative overflow-hidden">
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

                <ScrollArea className="h-[22.5rem]">
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
                                {result.sources.map((source: string, i: number) => {
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
                              {result.suggestedActions.slice(0, 3).map((action: string, i: number) => (
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
          </PopoverContent>
        </Popover>
      </div>
    </>,
    document.body
  );
}
