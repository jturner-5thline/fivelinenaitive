import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ClipboardCopy, Check, Share2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ChatMessage } from '@/hooks/useChatPersistence';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onCreateTask?: (title: string, priority: string) => void;
  onFollowUp?: (text: string) => void;
  onShareMessage?: (content: string) => void;
}

function parseTaskSuggestions(content: string) {
  const regex = /\*\*Suggested Task:\*\*\s*(.+?)\s*\(Priority:\s*(high|medium|low)\)/gi;
  const tasks: { title: string; priority: string }[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tasks.push({ title: match[1].trim(), priority: match[2].toLowerCase() });
  }
  return tasks;
}

function generateFollowUps(content: string): string[] {
  const followUps: string[] = [];
  if (/anomal|alert|⚠️|🔴|⏳|overdue/i.test(content)) followUps.push("How do I fix these issues?");
  if (/deal/i.test(content)) followUps.push("Tell me more about this deal");
  if (/lender/i.test(content)) followUps.push("Which lenders should I prioritize?");
  if (/task|milestone/i.test(content)) followUps.push("What tasks are most urgent?");
  if (/table|compari/i.test(content)) followUps.push("Show me more details");
  if (/match|search/i.test(content)) followUps.push("Add these lenders to my deal");
  if (followUps.length === 0) followUps.push("Tell me more", "What should I do next?");
  return followUps.slice(0, 3);
}

export function ChatMessageList({ messages, isLoading, onCreateTask, onFollowUp, onShareMessage }: Props) {
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleLinkClick = (href: string) => {
    if (href.startsWith('/')) navigate(href);
  };

  const lastMsg = messages[messages.length - 1];
  const showFollowUps = !isLoading && lastMsg?.role === 'assistant';

  return (
    <ScrollArea className="max-h-[400px] mb-3">
      <div className="space-y-3 px-1">
        {messages.map((msg, i) => {
          const tasks = msg.role === 'assistant' ? parseTaskSuggestions(msg.content) : [];
          return (
            <div key={i} className={cn('flex gap-2.5 group', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
              <div className="flex flex-col gap-1 max-w-[85%]">
                <div className={cn(
                  'rounded-lg px-3 py-2 text-sm relative',
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <button type="button" className="text-primary underline hover:text-primary/80 cursor-pointer" onClick={() => href && handleLinkClick(href)}>{children}</button>
                          ),
                          h1: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                          h2: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                          h3: ({ children }) => <h4 className="font-medium text-sm mt-2 mb-1">{children}</h4>,
                          ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                          p: ({ children }) => <p className="my-1">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          // Inline data tables
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-2 rounded border">
                              <table className="w-full text-xs border-collapse">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                          tbody: ({ children }) => <tbody>{children}</tbody>,
                          tr: ({ children }) => <tr className="border-b last:border-0">{children}</tr>,
                          th: ({ children }) => <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{children}</th>,
                          td: ({ children }) => <td className="px-2 py-1.5">{children}</td>,
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                  {/* Action buttons on hover */}
                  {msg.role === 'assistant' && (
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(msg.content, i)} title="Copy">
                        {copiedIdx === i ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                      </Button>
                      {onShareMessage && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onShareMessage(msg.content)} title="Share">
                          <Share2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {msg.created_at && (
                  <span className="text-[10px] text-muted-foreground px-1">
                    {format(new Date(msg.created_at), 'h:mm a')}
                  </span>
                )}
                {tasks.length > 0 && onCreateTask && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tasks.map((t, ti) => (
                      <Button key={ti} variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => onCreateTask(t.title, t.priority)}>
                        + Create: {t.title.slice(0, 30)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2.5 items-start">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
        {showFollowUps && onFollowUp && (
          <div className="flex flex-wrap gap-1.5 pl-7">
            {generateFollowUps(lastMsg.content).map((fu, i) => (
              <Button key={i} variant="outline" size="sm" className="h-7 text-xs" onClick={() => onFollowUp(fu)}>
                {fu}
              </Button>
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
    </ScrollArea>
  );
}
