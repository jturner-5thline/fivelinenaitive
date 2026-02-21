import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, Send, X, Lightbulb, TrendingUp, AlertTriangle,
  Calculator, FileSpreadsheet, Loader2, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpreadsheetWorkbook } from '@/hooks/useSpreadsheetWorkbook';
import ReactMarkdown from 'react-markdown';

interface AIAnalysisPanelProps {
  workbook: SpreadsheetWorkbook | null;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  { label: 'Analyze trends', icon: TrendingUp, prompt: 'Analyze the key trends in this spreadsheet data.' },
  { label: 'Find anomalies', icon: AlertTriangle, prompt: 'Identify any anomalies or outliers in this data.' },
  { label: 'Suggest formulas', icon: Calculator, prompt: 'Suggest useful formulas or calculations for this data.' },
  { label: 'Summarize data', icon: FileSpreadsheet, prompt: 'Provide a summary of the key metrics in this spreadsheet.' },
];

export function AIAnalysisPanel({ workbook, isOpen, onClose, className }: AIAnalysisPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getSpreadsheetContext = (): string => {
    if (!workbook) return 'No workbook loaded.';
    
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    // Extract first 50 rows of data as context
    const dataPreview = sheet.data
      .slice(0, 50)
      .filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''))
      .map(row => row.map(cell => cell ?? '').join('\t'))
      .join('\n');
    
    return `Workbook: ${workbook.name}\nActive Sheet: ${sheet.name}\nSheets: ${workbook.sheets.map(s => s.name).join(', ')}\n\nData Preview:\n${dataPreview}`;
  };

  const handleSend = async (prompt?: string) => {
    const messageText = prompt || input.trim();
    if (!messageText) return;

    const userMsg: ChatMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const context = getSpreadsheetContext();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spreadsheet-ai-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          context,
        }),
      });

      if (!response.ok) {
        throw new Error('AI analysis failed');
      }

      // Handle streaming response
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';
        let textBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant') {
                    return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                  }
                  return [...prev, { role: 'assistant', content: assistantContent }];
                });
              }
            } catch { /* skip partial */ }
          }
        }

        if (!assistantContent) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'I wasn\'t able to generate a response. Please try again.' }]);
        }
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error analyzing the spreadsheet. Please ensure the AI analysis function is deployed and try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn("w-80 border-l bg-background flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI Analysis</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">Quick analysis options:</p>
          {QUICK_PROMPTS.map((qp, i) => (
            <button
              key={i}
              onClick={() => handleSend(qp.prompt)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-left"
            >
              <qp.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs">{qp.label}</span>
              <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
            </button>
          ))}
          <Separator className="my-3" />
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <p>Ask any question about the data in your active sheet. I can analyze trends, suggest formulas, build models, and more.</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-xs",
                msg.role === 'user'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-xs dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about your data..."
            className="text-xs h-8"
            disabled={isLoading}
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
