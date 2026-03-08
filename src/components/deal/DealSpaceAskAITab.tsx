import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Loader2, Bot, User, History, X, Filter, ChevronDown } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import { useDealSpaceConversations } from '@/hooks/useDealSpaceConversations';
import { useDealSpaceDocuments } from '@/hooks/useDealSpaceDocuments';
import { useDealSpaceFinancials } from '@/hooks/useDealSpaceFinancials';
import { DealSpaceConversationHistory } from './DealSpaceConversationHistory';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface DealSpaceAskAITabProps {
  dealId: string;
}

type DocumentScope = 'all' | 'financial' | 'transcripts' | 'custom';

const SCOPE_LABELS: Record<DocumentScope, string> = {
  all: 'All Documents',
  financial: 'Financial Model Only',
  transcripts: 'Transcripts Only',
  custom: 'Custom',
};

export function DealSpaceAskAITab({ dealId }: DealSpaceAskAITabProps) {
  const { documents } = useDealSpaceDocuments(dealId);
  const { financials } = useDealSpaceFinancials(dealId);
  const { messages, sendMessage, clearMessages, isLoading: isAILoading, setMessages, scope, setScope } = useDealSpaceAI(dealId);
  const { 
    conversations, 
    isLoading: isConversationsLoading,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    loadConversationMessages,
    saveMessage,
  } = useDealSpaceConversations(dealId);
  
  const [question, setQuestion] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // scope and setScope come from useDealSpaceAI hook
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const totalDocuments = documents.length + financials.length;

  // Deduplicate conversations by title — keep only the most recent one per unique title
  const deduplicatedConversations = useMemo(() => {
    const seen = new Map<string, typeof conversations[0]>();
    for (const conv of conversations) {
      const key = (conv.title || '').trim().toLowerCase();
      if (!seen.has(key) || new Date(conv.updated_at) > new Date(seen.get(key)!.updated_at)) {
        seen.set(key, conv);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [conversations]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim()) return;
    
    let conversationId = selectedConversationId;
    if (!conversationId) {
      const newConvo = await createConversation(question.substring(0, 50) + (question.length > 50 ? '...' : ''));
      if (newConvo) {
        conversationId = newConvo.id;
        setSelectedConversationId(conversationId);
      }
    }
    
    if (conversationId) {
      await saveMessage(conversationId, 'user', question);
    }
    
    sendMessage(question);
    setQuestion('');
  }, [question, sendMessage, selectedConversationId, createConversation, saveMessage]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && selectedConversationId && !isAILoading) {
      saveMessage(selectedConversationId, 'assistant', lastMessage.content, lastMessage.sources);
    }
  }, [messages, selectedConversationId, isAILoading, saveMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const handleSelectConversation = useCallback(async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsHistoryOpen(false);
    
    const loadedMessages = await loadConversationMessages(conversationId);
    const formattedMessages = loadedMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: new Date(m.created_at),
      sources: m.sources as string[] | undefined,
    }));
    setMessages(formattedMessages);
  }, [loadConversationMessages, setMessages]);

  const handleNewConversation = useCallback(() => {
    setSelectedConversationId(null);
    clearMessages();
    setIsHistoryOpen(false);
  }, [clearMessages]);

  const suggestedQuestions = [
    "Generate a full lender-ready memo for this deal",
    "What are the key risks & hurdles for this deal?",
    "Summarize the current lender process & status",
    "What are the key credit strengths?",
  ];

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ask AI
            </CardTitle>
            <CardDescription>
              Ask questions about your uploaded documents and financials
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Scope filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  {SCOPE_LABELS[scope]}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Document Scope</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as DocumentScope)}>
                  <DropdownMenuRadioItem value="all" className="text-xs">
                    All Documents ({totalDocuments})
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="financial" className="text-xs">
                    Financial Model Only ({financials.length})
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="transcripts" className="text-xs">
                    Transcripts Only
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {totalDocuments > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalDocuments} file{totalDocuments !== 1 ? 's' : ''} indexed
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            >
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </div>
        </div>
        {/* Active scope indicator */}
        {scope !== 'all' && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[10px] gap-1 bg-primary/5 border-primary/20 text-primary">
              <Filter className="h-3 w-3" />
              Scope: {SCOPE_LABELS[scope]}
            </Badge>
            <button
              onClick={() => setScope('all')}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset to All
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex gap-4 overflow-hidden">
        {/* Conversation History Sidebar */}
        {isHistoryOpen && (
          <div className="w-64 flex-shrink-0 border-r pr-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Conversations</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsHistoryOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DealSpaceConversationHistory
              conversations={deduplicatedConversations}
              isLoading={isConversationsLoading}
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={deleteConversation}
              onUpdateTitle={updateConversationTitle}
            />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <ScrollArea className="flex-1 mb-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">
                  {totalDocuments === 0 
                    ? "Upload documents or financials to start"
                    : "Ask questions about your documents"
                  }
                </p>
                {totalDocuments > 0 && (
                  <div className="space-y-2 w-full max-w-sm">
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setQuestion(q)}
                        className="w-full text-left text-sm p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg p-3",
                        msg.role === 'user' 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isAILoading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={totalDocuments === 0 ? "Upload documents first..." : "Ask about your documents..."}
              disabled={totalDocuments === 0 || isAILoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendQuestion}
              disabled={!question.trim() || totalDocuments === 0 || isAILoading}
            >
              {isAILoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
