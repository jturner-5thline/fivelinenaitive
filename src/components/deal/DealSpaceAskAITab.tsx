import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Loader2, Bot, User, History, X, Filter, ChevronDown, Info, FileText, Mail } from 'lucide-react';
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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  all: 'All Sources',
  financial: 'Financial Model Only',
  transcripts: 'Transcripts Only',
  custom: 'Custom',
};

// Source citation chip component
function SourceCitations({ sources }: { sources?: string[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors group">
          <FileText className="h-3 w-3" />
          <span>{sources.length} source{sources.length !== 1 ? 's' : ''} referenced</span>
          <ChevronDown className="h-2.5 w-2.5 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {sources.map((source, i) => (
            <Badge key={i} variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-muted/50 font-normal">
              {source}
            </Badge>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const totalDocuments = documents.length + financials.length;

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

  const DRAFT_SUBMISSION_PROMPT = `Draft a lender submission email using this exact template. Fill in ALL bracketed fields using the deal data available to you:

Hi [LENDER NAME],

There's a deal we're working on I wanted to send your way:

[COMPANY NAME] is [Insert a one-paragraph company overview using the deal write-up description, memo narrative, pitch deck content, or call notes]

The Company is seeking [DEAL SIZE from deal value] to [USE OF FUNDS from the deal write-up]

I've attached the credit file [Include the data_room_url from the write-up as a hyperlink if available]. Inside, you'll find:

A Deal Overview summarizing the company and the transaction ask along with the financials & supporting information.

Let us know your initial thoughts or feedback!

Thank you,

IMPORTANT INSTRUCTIONS:

- Do NOT include any (Source:...) citations or source references in the email output. The email should be clean and ready to send.

- Format the email with proper spacing: add a blank line between each paragraph/section of the email for readability. Use markdown line breaks (two newlines) between the greeting, the intro line, the company overview paragraph, the deal size line, the credit file line, the sign-off, etc.

- For LENDER NAME: Use the FIRST NAME of the contact person associated with that lender. Look at the lender's contact information or contact name field. If the contact name is 'John Smith', use 'John'. If no contact first name is available, fall back to the lender institution name. Generate one version for each ACTIVE lender on this deal. If there are multiple active lenders, produce a separate email for each one.

- For COMPANY NAME: Use the company name from the deal record.

- For the company overview paragraph: Pull from the deal write-up description, memo narrative, company highlights, or any uploaded pitch deck / call notes. Keep it to one concise paragraph.

- For DEAL SIZE: Use the deal value.

- For USE OF FUNDS: Pull from the deal write-up use_of_funds field.

- For the data room link: Use the data_room_url from the write-up if available, otherwise note that a link should be inserted.`;

  const handleDraftSubmission = useCallback(() => {
    setQuestion('');
    sendMessage(DRAFT_SUBMISSION_PROMPT);
    
    (async () => {
      let conversationId = selectedConversationId;
      if (!conversationId) {
        const newConvo = await createConversation('Draft Submission Email');
        if (newConvo) {
          conversationId = newConvo.id;
          setSelectedConversationId(conversationId);
        }
      }
      if (conversationId) {
        await saveMessage(conversationId, 'user', DRAFT_SUBMISSION_PROMPT);
      }
    })();
  }, [sendMessage, selectedConversationId, createConversation, saveMessage]);

  const suggestedQuestions = [
    "Generate a full lender-ready memo for this deal",
    "What are the key risks & hurdles for this deal?",
    "Summarize the current lender process & status",
    "What outstanding items need attention?",
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
              Ask questions about this deal's data, documents, and activity
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  {SCOPE_LABELS[scope]}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Source Scope</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as DocumentScope)}>
                  <DropdownMenuRadioItem value="all" className="text-xs">
                    All Sources
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
                {totalDocuments} file{totalDocuments !== 1 ? 's' : ''}
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
        {/* Info banner */}
        <div className="flex items-start gap-2 mt-2 p-2 rounded-md bg-muted/40 border border-border/50">
          <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Ask AI analyzes <strong>lender statuses</strong>, <strong>deal notes</strong>, <strong>data room documents</strong>, <strong>outstanding items</strong>, <strong>call transcripts</strong>, and <strong>deal details</strong> to answer your questions.
          </p>
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
                <p className="text-muted-foreground mb-2">
                  {totalDocuments === 0 
                    ? "Ask about lender statuses, notes, deal activity, and more"
                    : "Ask questions about your deal data and documents"
                  }
                </p>
                {totalDocuments === 0 && (
                  <p className="text-[11px] text-muted-foreground/60 mb-4 max-w-xs">
                    No documents uploaded yet — but Ask AI can still analyze deal details, lender statuses, notes, outstanding items, and activity logs.
                  </p>
                )}
                <div className="space-y-2 w-full max-w-sm">
                  <button
                    onClick={handleDraftSubmission}
                    disabled={isAILoading}
                    className="w-full text-left text-sm p-3 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors flex items-center gap-2.5 font-medium text-primary disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    Draft Submission Email
                  </button>
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
                        <>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          <SourceCitations sources={msg.sources} />
                        </>
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
                    <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs text-muted-foreground">Analyzing deal data…</span>
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
              placeholder="Ask about this deal..."
              disabled={isAILoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendQuestion}
              disabled={!question.trim() || isAILoading}
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
