import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, File, Trash2, Download, Send, Loader2, MessageSquare, FileText, Sparkles, X, Bot, User, Eye, History, Zap, ChevronRight, Table2, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDealSpaceDocuments, DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { useDealSpaceAI } from '@/hooks/useDealSpaceAI';
import { useDealSpaceConversations, DealSpaceMessage } from '@/hooks/useDealSpaceConversations';
import { DealSpaceDocumentPreview } from './DealSpaceDocumentPreview';
import { DealSpaceConversationHistory } from './DealSpaceConversationHistory';
import { DealSpaceFinancialsCard } from './DealSpaceFinancialsCard';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

interface DealSpaceTabProps {
  dealId: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (contentType: string | null, name: string) => {
  const lowerName = name.toLowerCase();
  if (contentType?.includes('pdf') || lowerName.endsWith('.pdf')) {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  if (contentType?.includes('word') || lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
    return <FileText className="h-5 w-5 text-blue-500" />;
  }
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return <Table2 className="h-5 w-5 text-green-500" />;
  }
  if (lowerName.endsWith('.pptx')) {
    return <Presentation className="h-5 w-5 text-orange-500" />;
  }
  if (contentType?.includes('text') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  }
  return <File className="h-5 w-5 text-muted-foreground" />;
};

export function DealSpaceTab({ dealId }: DealSpaceTabProps) {
  const { documents, isLoading, isUploading, uploadDocument, deleteDocument, getDownloadUrl } = useDealSpaceDocuments(dealId);
  const { messages, sendMessage, clearMessages, isLoading: isAILoading, setMessages } = useDealSpaceAI(dealId);
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
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DealSpaceDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<{ text: string; keyPoints: string[] } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    
    for (let i = 0; i < files.length; i++) {
      await uploadDocument(files[i]);
    }
  }, [uploadDocument]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDownload = useCallback(async (doc: DealSpaceDocument) => {
    const url = await getDownloadUrl(doc);
    if (url) {
      window.open(url, '_blank');
    }
  }, [getDownloadUrl]);

  const handlePreview = useCallback((doc: DealSpaceDocument) => {
    setPreviewDocument(doc);
    setIsPreviewOpen(true);
  }, []);

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim()) return;
    
    // If no active conversation, create one
    let conversationId = selectedConversationId;
    if (!conversationId) {
      const newConvo = await createConversation(question.substring(0, 50) + (question.length > 50 ? '...' : ''));
      if (newConvo) {
        conversationId = newConvo.id;
        setSelectedConversationId(conversationId);
      }
    }
    
    // Save user message
    if (conversationId) {
      await saveMessage(conversationId, 'user', question);
    }
    
    sendMessage(question);
    setQuestion('');
  }, [question, sendMessage, selectedConversationId, createConversation, saveMessage]);

  // Save assistant response when it arrives
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
    
    // Load messages for this conversation
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

  const handleSummarize = useCallback(async () => {
    if (documents.length === 0) return;
    
    setIsSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { dealId, action: 'summarize' },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSummary({
        text: data.summary,
        keyPoints: data.keyPoints || [],
      });
      setShowSummary(true);
      toast({ title: 'Summary generated', description: `Analyzed ${data.documentCount} document(s)` });
    } catch (err) {
      console.error('Summarization error:', err);
      toast({
        title: 'Summarization failed',
        description: err instanceof Error ? err.message : 'Could not generate summary',
        variant: 'destructive',
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [dealId, documents.length]);

  const suggestedQuestions = [
    "What are the key terms in this deal?",
    "Summarize the main risks mentioned",
    "What are the financial highlights?",
    "List all action items from the notes",
  ];

  return (
    <div className="space-y-6">
      {/* Top Row: Documents + AI Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents
              </CardTitle>
              <CardDescription>
                Upload transcripts, notes, and files for AI analysis
              </CardDescription>
            </div>
            {documents.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSummarize}
                disabled={isSummarizing}
              >
                {isSummarizing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Summarize All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {/* Summary Section */}
          {showSummary && summary && (
            <Collapsible open={showSummary} onOpenChange={setShowSummary} className="mb-4">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <CollapsibleTrigger className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">AI Summary</span>
                  </div>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-transform",
                    showSummary && "rotate-90"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <ScrollArea className="max-h-[200px]">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{summary.text}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 text-xs"
                    onClick={() => setShowSummary(false)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Close
                  </Button>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors mb-4",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
              isUploading && "opacity-50 pointer-events-none"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
              accept=".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.xlsx,.xls,.pptx"
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop files here, or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary hover:underline"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Text, Excel, PowerPoint
                </p>
              </div>
            )}
          </div>

          {/* Documents List */}
          <div className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No documents uploaded yet</p>
                <p className="text-xs mt-1">Upload files to start asking questions</p>
              </div>
            ) : (
              <ScrollArea className="h-[250px]">
                <div className="space-y-2 pr-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => handlePreview(doc)}
                    >
                      {getFileIcon(doc.content_type, doc.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.size_bytes)} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(doc);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete document?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{doc.name}" from Deal Space.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteDocument(doc)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {documents.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <Badge variant="secondary" className="text-xs">
                {documents.length} document{documents.length !== 1 ? 's' : ''} • Ready for AI analysis
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Chat Panel */}
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Ask AI
              </CardTitle>
              <CardDescription>
                Ask questions about your uploaded documents
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant={isHistoryOpen ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="text-xs"
              >
                <History className="h-3 w-3 mr-1" />
                History
              </Button>
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleNewConversation} className="text-xs">
                  <X className="h-3 w-3 mr-1" />
                  New
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {/* History Panel */}
          {isHistoryOpen && (
            <div className="mb-4 p-3 bg-muted/30 rounded-lg border">
              <DealSpaceConversationHistory
                conversations={conversations}
                selectedConversationId={selectedConversationId}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
                onDeleteConversation={deleteConversation}
                onUpdateTitle={updateConversationTitle}
                isLoading={isConversationsLoading}
              />
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea className="flex-1 min-h-[300px] max-h-[400px] mb-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  {documents.length === 0 
                    ? "Upload documents to start asking questions"
                    : "Ask a question about your documents"
                  }
                </p>
                {documents.length > 0 && (
                  <div className="space-y-2 w-full max-w-sm">
                    <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setQuestion(q)}
                        className="w-full text-left text-sm p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
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
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <p className="text-xs opacity-70 mb-1">Sources:</p>
                          <div className="flex flex-wrap gap-1">
                            {msg.sources.map((src, j) => (
                              <Badge key={j} variant="secondary" className="text-xs">
                                {src}
                              </Badge>
                            ))}
                          </div>
                        </div>
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
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Analyzing documents...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={documents.length === 0 ? "Upload documents first..." : "Ask a question..."}
              disabled={documents.length === 0 || isAILoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendQuestion}
              disabled={!question.trim() || documents.length === 0 || isAILoading}
              size="icon"
            >
              {isAILoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Financials Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DealSpaceFinancialsCard dealId={dealId} />
      </div>

      {/* Document Preview Modal */}
      <DealSpaceDocumentPreview
        document={previewDocument}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onDownload={handleDownload}
      />
    </div>
  );
}
