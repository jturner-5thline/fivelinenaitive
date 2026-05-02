import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCopy, Check, Share2, ListPlus, Pin, User } from 'lucide-react';
import { addPinnedInsight, removePinnedInsight, getPinnedInsights } from './PinnedInsightsPanel';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ChatMessage } from '@/hooks/useChatPersistence';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ResearchCitations } from './ResearchCitations';
import { EmailDraftCard, extractEmailDraft } from './EmailDraftCard';
import { MorningBriefing, isBriefingMessage, BRIEFING_MARKER } from './MorningBriefing';
import { MorningIntelligenceBrief, isIntelBriefMessage, INTEL_BRIEF_MARKER } from './MorningIntelligenceBrief';
import { CopilotActionConfirm } from '@/components/copilot/CopilotActionConfirm';

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onCreateTask?: (title: string, priority: string) => void;
  onFollowUp?: (text: string) => void;
  onShareMessage?: (content: string) => void;
  onSendAction?: (prompt: string) => void;
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

/**
 * Extract a confirm-action JSON payload from the assistant message body.
 * The Dashboard AI emits write-action requests as a fenced ```json block:
 *   {"action":"confirm","action_type":"update_deal_status","description":"…","params":{…}}
 * Returns { action, cleanedContent } — cleanedContent has the JSON block
 * stripped so the markdown body renders normally and the card renders below.
 */
function extractCopilotAction(content: string): {
  action: { action: 'confirm'; action_type: string; description: string; params: Record<string, any> } | null;
  cleanedContent: string;
} {
  if (!content) return { action: null, cleanedContent: content };
  const fence = /```json\s*\n([\s\S]*?)\n```/g;
  let match;
  let found: any = null;
  let foundRaw = '';
  while ((match = fence.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && parsed.action === 'confirm' && typeof parsed.action_type === 'string' && parsed.params) {
        found = parsed;
        foundRaw = match[0];
        break;
      }
    } catch {
      // skip non-confirm JSON blocks
    }
  }
  if (!found) return { action: null, cleanedContent: content };
  return { action: found, cleanedContent: content.replace(foundRaw, '').trim() };
}

/**
 * Render-time dedupe guard for the AI chat panel.
 *
 * Two failure modes the chat assembly can produce that this guards against:
 *   1. Two consecutive assistant messages with identical (normalized) content
 *      — e.g. an optimistic streaming bubble and the persisted tool-result
 *      message both landing in `messages`. We keep the first.
 *   2. A single assistant message whose tail repeats the same paragraph
 *      verbatim (most often the "What would you like to do next?" / "Let me
 *      know what you'd like to do next." follow-up emitted twice when a
 *      structured action card and a prose summary collide). We collapse to
 *      one occurrence in-place.
 */
function normalizeForCompare(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function collapseRepeatedTrailingParagraphs(content: string): string {
  if (!content) return content;
  // Split on blank lines (paragraph boundaries). Walk from the end and drop
  // a trailing paragraph if it duplicates the one before it.
  const paragraphs = content.split(/\n{2,}/);
  if (paragraphs.length < 2) return content;
  let changed = false;
  for (let i = paragraphs.length - 1; i > 0; i--) {
    const a = normalizeForCompare(paragraphs[i]);
    const b = normalizeForCompare(paragraphs[i - 1]);
    if (a && a === b) {
      paragraphs.splice(i, 1);
      changed = true;
    }
  }
  return changed ? paragraphs.join('\n\n') : content;
}

function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    const cleaned: ChatMessage =
      msg.role === 'assistant'
        ? { ...msg, content: collapseRepeatedTrailingParagraphs(msg.content) }
        : msg;
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.role === 'assistant' &&
      cleaned.role === 'assistant' &&
      normalizeForCompare(prev.content) === normalizeForCompare(cleaned.content)
    ) {
      // Drop the duplicate consecutive assistant message.
      continue;
    }
    out.push(cleaned);
  }
  return out;
}

/** Extract [n] citation references and match them to URLs in the content */
function extractCitations(content: string): string[] {
  // Look for citation URLs in the content — patterns like [1] https://... or **Sources:** blocks
  const urlPattern = /\[(\d+)\]\s*(https?:\/\/[^\s)]+)/g;
  const citations: string[] = [];
  let m;
  while ((m = urlPattern.exec(content)) !== null) {
    citations.push(m[2]);
  }
  // Also check for a Sources/References section
  const sourcesMatch = content.match(/(?:Sources|References|Citations):\s*\n((?:- .+\n?)+)/i);
  if (sourcesMatch) {
    const urls = sourcesMatch[1].match(/https?:\/\/[^\s)]+/g);
    if (urls) citations.push(...urls);
  }
  return [...new Set(citations)];
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 items-start">
      <Avatar className="h-6 w-6 shrink-0 border border-primary/30 bg-primary/10">
        <AvatarFallback className="bg-transparent">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </AvatarFallback>
      </Avatar>
      <div className="rounded-xl px-4 py-3 border border-[hsl(263,40%,30%,0.4)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.5)_0%,hsl(263,18%,8%,0.6)_100%)] backdrop-blur-md shadow-[inset_0_1px_1px_hsl(263,40%,40%,0.08),0_2px_8px_hsl(0,0%,0%,0.2)]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, isLoading, onCreateTask, onFollowUp, onShareMessage, onSendAction }: Props) {
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [pinnedContents, setPinnedContents] = useState<Set<string>>(() => {
    return new Set(getPinnedInsights().map(i => i.content.slice(0, 100)));
  });

  // Apply render-time dedupe so the panel never shows the same assistant
  // follow-up twice, even if upstream message assembly pushed duplicates.
  const renderedMessages = dedupeMessages(messages);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [renderedMessages]);

  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handlePin = (content: string) => {
    const key = content.slice(0, 100);
    if (pinnedContents.has(key)) {
      const all = getPinnedInsights();
      const match = all.find(i => i.content.slice(0, 100) === key);
      if (match) removePinnedInsight(match.id);
      setPinnedContents(prev => { const n = new Set(prev); n.delete(key); return n; });
      toast('Unpinned');
    } else {
      addPinnedInsight(content);
      setPinnedContents(prev => new Set(prev).add(key));
      toast.success('Pinned to insights');
    }
  };

  const handleLinkClick = (href: string) => {
    if (href.startsWith('/')) navigate(href);
  };

  const lastMsg = renderedMessages[renderedMessages.length - 1];
  const showFollowUps = !isLoading && lastMsg?.role === 'assistant';

  return (
    <ScrollArea className="max-h-[400px] mb-3">
      <div className="space-y-3 px-1">
        {renderedMessages.map((msg, i) => {
          const tasks = msg.role === 'assistant' ? parseTaskSuggestions(msg.content) : [];
          const isUser = msg.role === 'user';
          const isPinned = pinnedContents.has(msg.content.slice(0, 100));
          const isBriefing = !isUser && isBriefingMessage(msg.content);
          const isIntelBrief = !isUser && isIntelBriefMessage(msg.content);
          // Extract any embedded copilot confirm-action block (write actions).
          const { action: copilotAction, cleanedContent: cleanedAssistantContent } =
            !isUser && !isBriefing && !isIntelBrief
              ? extractCopilotAction(msg.content)
              : { action: null, cleanedContent: msg.content };

          // Extract optional AI summary from briefing message
          const briefingAiSummary = isBriefing
            ? msg.content.slice(BRIEFING_MARKER.length).trim() || undefined
            : undefined;

          return (
            <div
              key={msg.id || `${msg.role}-${i}-${normalizeForCompare(msg.content).slice(0, 32)}`}
              className={cn('flex gap-2.5 group', isUser ? 'justify-end' : 'justify-start')}
            >
              {/* AI Avatar */}
              {!isUser && (
                <Avatar className="h-6 w-6 shrink-0 mt-0.5 border border-primary/30 bg-primary/10">
                  <AvatarFallback className="bg-transparent">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div className="flex flex-col gap-1 max-w-[85%]">
                {/* Message bubble */}
                <div className={cn(
                  'rounded-xl px-3.5 py-2.5 text-sm relative transition-all duration-200',
                  isUser
                    ? 'bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--primary)/0.85)_100%)] text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.3)]'
                    : 'border border-[hsl(263,40%,30%,0.4)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.5)_0%,hsl(263,18%,8%,0.6)_100%)] backdrop-blur-md shadow-[inset_0_1px_1px_hsl(263,40%,40%,0.08),0_2px_8px_hsl(0,0%,0%,0.2)]',
                  isPinned && 'ring-1 ring-primary/40'
                )}>
                  {isBriefing ? (
                    <MorningBriefing aiSummary={briefingAiSummary} />
                  ) : isIntelBrief ? (
                    <MorningIntelligenceBrief onAction={onSendAction} />
                  ) : !isUser ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => {
                            const isInternal = !!href && href.startsWith('/');
                            const isTaskLink = !!href && href.startsWith('/tasks/');
                            if (isTaskLink) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => href && handleLinkClick(href)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-medium text-[13px] no-underline transition-colors border border-primary/20 hover:border-primary/40 cursor-pointer align-baseline"
                                  title="Open task"
                                >
                                  {children}
                                </button>
                              );
                            }
                            return (
                              <button
                                type="button"
                                className="text-primary underline hover:text-primary/80 cursor-pointer"
                                onClick={() => isInternal ? href && handleLinkClick(href) : href && window.open(href, '_blank', 'noopener,noreferrer')}
                              >
                                {children}
                              </button>
                            );
                          },
                          h1: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                          h2: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
                          h3: ({ children }) => <h4 className="font-medium text-sm mt-2 mb-1">{children}</h4>,
                          ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                          p: ({ children }) => <p className="my-1">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          code: ({ children, className }) => {
                            const isBlock = className?.includes('language-');
                            return isBlock
                              ? <code className="block bg-background/30 rounded p-2 text-xs font-mono overflow-x-auto my-1">{children}</code>
                              : <code className="bg-background/30 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
                          },
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-2 rounded border border-border/40">
                              <table className="w-full text-xs border-collapse">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead className="bg-muted/30">{children}</thead>,
                          tbody: ({ children }) => <tbody>{children}</tbody>,
                          tr: ({ children }) => <tr className="border-b border-border/30 last:border-0">{children}</tr>,
                          th: ({ children }) => <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{children}</th>,
                          td: ({ children }) => <td className="px-2 py-1.5">{children}</td>,
                        }}
                      >{cleanedAssistantContent}</ReactMarkdown>
                      {copilotAction && (
                        <CopilotActionConfirm action={copilotAction} />
                      )}
                    </div>
                  ) : msg.content}

                  {/* Research citations */}
                  {!isUser && !isBriefing && (() => {
                    const cites = extractCitations(msg.content);
                    return cites.length > 0 ? <ResearchCitations citations={cites} /> : null;
                  })()}

                  {/* Email draft card */}
                  {!isUser && !isBriefing && (() => {
                    const draft = extractEmailDraft(msg.content);
                    return draft ? <EmailDraftCard draft={draft} onSend={onSendAction} /> : null;
                  })()}
                </div>

                {/* Quick action toolbar for AI messages */}
                {!isUser && (
                  <div className="flex items-center gap-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => handleCopy(msg.content, i)} title="Copy">
                      {copiedIdx === i ? <Check className="h-3 w-3 text-success" /> : <ClipboardCopy className="h-3 w-3" />}
                    </Button>
                    {onShareMessage && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => onShareMessage(msg.content)} title="Share">
                        <Share2 className="h-3 w-3" />
                      </Button>
                    )}
                    {onCreateTask && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => onCreateTask(msg.content.slice(0, 60), 'medium')} title="Create task">
                        <ListPlus className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className={cn("h-6 w-6", isPinned ? "text-primary" : "text-muted-foreground hover:text-foreground")} onClick={() => handlePin(msg.content)} title={isPinned ? "Unpin" : "Pin to insights"}>
                      <Pin className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Timestamp */}
                {msg.created_at && (
                  <span className="text-[10px] text-muted-foreground px-1">
                    {format(new Date(msg.created_at), 'h:mm a')}
                  </span>
                )}

                {/* Task suggestions */}
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

              {/* User Avatar */}
              {isUser && (
                <Avatar className="h-6 w-6 shrink-0 mt-0.5 border border-border bg-muted">
                  <AvatarFallback className="bg-transparent text-[10px] font-medium">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && renderedMessages[renderedMessages.length - 1]?.role === 'user' && <TypingIndicator />}

        {/* Follow-up suggestions */}
        {showFollowUps && onFollowUp && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {generateFollowUps(lastMsg.content).map((fu, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="h-7 text-xs border-[hsl(263,40%,30%,0.4)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.4)_0%,hsl(263,18%,8%,0.5)_100%)] backdrop-blur-sm hover:border-[hsl(263,50%,40%,0.5)] hover:bg-[linear-gradient(135deg,hsl(260,25%,14%,0.5)_0%,hsl(263,22%,11%,0.6)_100%)] transition-all duration-200"
                onClick={() => onFollowUp(fu)}
              >
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
