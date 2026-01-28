import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, Trash2, Download, Send, Loader2, FileSpreadsheet, 
  Sparkles, X, Bot, User, Eye, DollarSign, Calendar, StickyNote,
  ChevronDown, Edit2, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useDealSpaceFinancials, DealSpaceFinancial } from '@/hooks/useDealSpaceFinancials';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

interface DealSpaceFinancialsCardProps {
  dealId: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);
const periodOptions = ['Q1', 'Q2', 'Q3', 'Q4', 'FY', 'H1', 'H2', 'YTD'];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function DealSpaceFinancialsCard({ dealId }: DealSpaceFinancialsCardProps) {
  const { 
    financials, 
    isLoading, 
    isUploading, 
    uploadFinancial, 
    updateFinancial,
    deleteFinancial, 
    getDownloadUrl 
  } = useDealSpaceFinancials(dealId);
  
  const [isDragging, setIsDragging] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editYear, setEditYear] = useState<string>('');
  const [editPeriod, setEditPeriod] = useState<string>('');
  const [isDocListOpen, setIsDocListOpen] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFinancial(files[i]);
    }
  }, [uploadFinancial]);

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

  const handleDownload = useCallback(async (financial: DealSpaceFinancial) => {
    const url = await getDownloadUrl(financial);
    if (url) {
      window.open(url, '_blank');
    }
  }, [getDownloadUrl]);

  const startEditing = (financial: DealSpaceFinancial) => {
    setEditingId(financial.id);
    setEditNotes(financial.notes || '');
    setEditYear(financial.fiscal_year?.toString() || '');
    setEditPeriod(financial.fiscal_period || '');
  };

  const saveEditing = async () => {
    if (!editingId) return;
    await updateFinancial(editingId, {
      notes: editNotes || undefined,
      fiscal_year: editYear ? parseInt(editYear) : undefined,
      fiscal_period: editPeriod || undefined,
    });
    setEditingId(null);
  };

  const handleSendQuestion = useCallback(async () => {
    if (!question.trim() || financials.length === 0) return;

    const userMessage: Message = {
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setQuestion('');
    setIsAILoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('deal-space-financials-ai', {
        body: { 
          dealId,
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error('AI error:', err);
      toast({
        title: 'AI Error',
        description: err instanceof Error ? err.message : 'Failed to get response',
        variant: 'destructive',
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error analyzing your financials. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsAILoading(false);
    }
  }, [question, financials.length, messages, dealId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  }, [handleSendQuestion]);

  const suggestedQuestions = [
    "Summarize the key financial metrics",
    "What are the revenue trends?",
    "Identify any red flags in these financials",
    "Compare year-over-year performance",
  ];

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Financials
            </CardTitle>
            <CardDescription>
              Upload and analyze financial documents
            </CardDescription>
          </div>
          {financials.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {financials.length} file{financials.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4 overflow-hidden">
        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
            isDragging ? "border-green-500 bg-green-500/5" : "border-muted-foreground/25 hover:border-green-500/50",
            isUploading && "opacity-50 pointer-events-none"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx"
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-green-500" />
              <p className="text-xs text-muted-foreground">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Drop financials here or{' '}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-green-500 hover:underline"
                >
                  browse
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Documents List - Collapsible */}
        {financials.length > 0 && (
          <Collapsible open={isDocListOpen} onOpenChange={setIsDocListOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary">
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Uploaded Files
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isDocListOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[150px] mt-2">
                <div className="space-y-2 pr-2">
                  {financials.map((financial) => (
                    <div
                      key={financial.id}
                      className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg group hover:bg-muted/80 transition-colors"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{financial.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(financial.size_bytes)}</span>
                          {financial.fiscal_year && financial.fiscal_period && (
                            <>
                              <span>•</span>
                              <span>{financial.fiscal_period} {financial.fiscal_year}</span>
                            </>
                          )}
                        </div>
                        {editingId === financial.id ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex gap-2">
                              <Select value={editYear} onValueChange={setEditYear}>
                                <SelectTrigger className="h-7 text-xs w-20">
                                  <SelectValue placeholder="Year" />
                                </SelectTrigger>
                                <SelectContent>
                                  {yearOptions.map(y => (
                                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={editPeriod} onValueChange={setEditPeriod}>
                                <SelectTrigger className="h-7 text-xs w-16">
                                  <SelectValue placeholder="Period" />
                                </SelectTrigger>
                                <SelectContent>
                                  {periodOptions.map(p => (
                                    <SelectItem key={p} value={p}>{p}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder="Add notes..."
                              className="h-16 text-xs resize-none"
                            />
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={saveEditing}>
                                <Check className="h-3 w-3 mr-1" />
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : financial.notes ? (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{financial.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => startEditing(financial)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDownload(financial)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete financial?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{financial.name}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteFinancial(financial)}>
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
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* AI Chat Section */}
        <div className="flex-1 flex flex-col min-h-0 border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Ask AI about Financials</span>
          </div>

          <ScrollArea className="flex-1 min-h-[150px] max-h-[200px] mb-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-4">
                <Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground mb-3">
                  {financials.length === 0 
                    ? "Upload financials to start"
                    : "Ask questions about your financials"
                  }
                </p>
                {financials.length > 0 && (
                  <div className="space-y-1 w-full max-w-xs">
                    {suggestedQuestions.slice(0, 2).map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setQuestion(q)}
                        className="w-full text-left text-xs p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg p-2 text-xs",
                        msg.role === 'user' 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-xs dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                ))}
                {isAILoading && (
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg p-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
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
              placeholder={financials.length === 0 ? "Upload financials first..." : "Ask about financials..."}
              disabled={financials.length === 0 || isAILoading}
              className="flex-1 h-8 text-xs"
            />
            <Button
              onClick={handleSendQuestion}
              disabled={!question.trim() || financials.length === 0 || isAILoading}
              size="sm"
              className="h-8 w-8 p-0"
            >
              {isAILoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
