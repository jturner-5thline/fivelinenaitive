import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Mic, MicOff, X, ListTodo, Mail, Sparkles as AskIcon } from 'lucide-react';
import { FileAttachmentButton, AttachedFile } from './FileAttachmentButton';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { NaitiveTaskComposer } from './NaitiveTaskComposer';
import {
  inferComposerIntent,
  AMBIGUITY_THRESHOLD,
  type ComposerIntent,
} from './inferComposerIntent';

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

interface Props {
  onSend: (text: string, attachments?: AttachedFile[]) => void;
  isLoading: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  teamMembers?: TeamMember[];
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  onFocus?: () => void;
  onBlur?: () => void;
}

const slashCommands = [
  { cmd: '/briefing', desc: 'Daily morning briefing', icon: '☀️' },
  { cmd: '/research', desc: 'Research a company or market', icon: '🔍' },
  { cmd: '/email', desc: 'Draft a lender outreach email', icon: '✉️' },
  { cmd: '/memo', desc: 'Generate a deal memo', icon: '📄' },
  { cmd: '/compare', desc: 'Compare deals side-by-side', icon: '⚖️' },
  { cmd: '/pipeline', desc: 'Pipeline analytics & conversion', icon: '📊' },
  { cmd: '/match', desc: 'Find lenders for a deal', icon: '🎯' },
  { cmd: '/tasks', desc: 'Show my tasks & milestones', icon: '✅' },
  { cmd: '/alerts', desc: 'Show anomalies & risks', icon: '⚠️' },
  { cmd: '/catchup', desc: 'What happened while I was away?', icon: '🔄' },
];

export function ChatInputBar({ onSend, isLoading, inputValue, setInputValue, teamMembers = [], inputRef: externalRef, onFocus, onBlur }: Props) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  // Composer mode is now derived from the prompt at submit time, not selected
  // by the user. We keep a small piece of state for two transient situations:
  //   - 'task' renders the dedicated NaitiveTaskComposer for preview/confirm
  //   - 'ambiguous' surfaces a small clarification chip row
  type ComposerView = 'input' | 'task' | 'ambiguous';
  const [view, setView] = useState<ComposerView>('input');
  const [pendingText, setPendingText] = useState('');
  // Tiny indicator shown briefly after submission ("Drafting email" / "Creating task").
  const [lastIntent, setLastIntent] = useState<ComposerIntent | null>(null);
  const lastIntentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [inputValue]);

  // Detect @mention
  useEffect(() => {
    const lastAt = inputValue.lastIndexOf('@');
    if (lastAt >= 0 && lastAt === inputValue.length - 1 || (lastAt >= 0 && !inputValue.slice(lastAt).includes(' '))) {
      const filter = inputValue.slice(lastAt + 1).toLowerCase();
      setMentionFilter(filter);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }, [inputValue]);

  const insertMention = (member: TeamMember) => {
    const lastAt = inputValue.lastIndexOf('@');
    const before = inputValue.slice(0, lastAt);
    setInputValue(`${before}@${member.display_name} `);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const filteredMembers = teamMembers.filter(m =>
    m.display_name.toLowerCase().includes(mentionFilter) || m.email.toLowerCase().includes(mentionFilter)
  ).slice(0, 5);

  const showSlashHint = inputValue.startsWith('/') && inputValue.length < 15 && !showMentions;
  const filteredCommands = slashCommands.filter(c => c.cmd.startsWith(inputValue.toLowerCase()));

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedCmdIdx(0);
  }, [inputValue]);

  // Clean up the post-submit pill timer on unmount.
  useEffect(() => () => {
    if (lastIntentTimerRef.current) clearTimeout(lastIntentTimerRef.current);
  }, []);

  /**
   * Dispatch a prompt according to the resolved intent. `task` swaps the view
   * to NaitiveTaskComposer (so the user can confirm the parsed draft), the
   * other two intents reuse the same `onSend` pipeline the parent already
   * wires up — preserving backend behavior for ask/email.
   */
  const dispatchIntent = useCallback(
    (intent: ComposerIntent, text: string, attachmentsForSend?: AttachedFile[]) => {
      // Best-effort analytics hook so accuracy can be monitored over time.
      try {
        window.dispatchEvent(
          new CustomEvent('composer:intent', { detail: { intent, length: text.length } }),
        );
      } catch {
        /* no-op */
      }

      if (intent === 'task') {
        setPendingText(text);
        setView('task');
        setInputValue('');
        setLastIntent('task');
        return;
      }

      if (intent === 'email') {
        // The chat backend already routes prompts that begin with `/email`
        // through the email-drafting path, so we just normalize here.
        const payload = text.toLowerCase().startsWith('/email') ? text : `/email ${text}`;
        onSend(payload, attachmentsForSend);
      } else {
        onSend(text, attachmentsForSend);
      }

      setAttachments([]);
      setLastIntent(intent);
      // Auto-clear the indicator after 2.5s so the composer stays clean.
      if (lastIntentTimerRef.current) clearTimeout(lastIntentTimerRef.current);
      lastIntentTimerRef.current = setTimeout(() => setLastIntent(null), 2500);
    },
    [onSend, setInputValue],
  );

  /**
   * Submit handler. Classifies the prompt locally (synchronous, no network),
   * then either dispatches with high confidence or shows the clarification
   * chips for the user to disambiguate.
   */
  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const result = inferComposerIntent(text, {
      pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });

    if (result.confidence < AMBIGUITY_THRESHOLD) {
      setPendingText(text);
      setView('ambiguous');
      return;
    }

    dispatchIntent(result.intent, text, attachments.length > 0 ? attachments : undefined);
  }, [inputValue, isLoading, attachments, dispatchIntent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Navigate slash commands
    if (showSlashHint && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedCmdIdx(i => Math.min(i + 1, filteredCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedCmdIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const selected = filteredCommands[selectedCmdIdx];
        if (selected) { setInputValue(''); onSend(selected.desc); }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Microphone access denied. Please enable it in your browser settings.'); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = 'en-US';
    recognitionRef.current = r;
    r.onresult = (e: any) => { setInputValue(Array.from(e.results).map((r: any) => r[0].transcript).join('')); };
    r.onend = () => setIsListening(false);
    r.onerror = () => { setIsListening(false); toast.error('Microphone access denied. Please enable it in your browser settings.'); };
    r.start(); setIsListening(true);
  }, [isListening, setInputValue]);

  const hasInput = inputValue.trim().length > 0;

  return (
    <div className="relative">
      {/* Subtle indicator surfaced briefly after submission to confirm the
          inferred mode (e.g. "Drafting email"). Replaces the old permanent
          mode tabs — visible only for ~2.5s. */}
      {lastIntent && view === 'input' && (
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {lastIntent === 'email' && <Mail className="h-3 w-3" />}
          {lastIntent === 'task' && <ListTodo className="h-3 w-3" />}
          {lastIntent === 'ask' && <AskIcon className="h-3 w-3" />}
          <span>
            {lastIntent === 'email'
              ? 'Drafting email'
              : lastIntent === 'task'
                ? 'Creating task'
                : 'Asking naitive'}
          </span>
        </div>
      )}

      {/* Inferred-task: render the dedicated composer prefilled with the
          original prompt so the user can preview/confirm the parsed draft. */}
      {view === 'task' ? (
        <NaitiveTaskComposer
          autoFocus
          initialText={pendingText || undefined}
          onCreated={() => {
            setView('input');
            setPendingText('');
          }}
        />
      ) : (
        <>
      {/* Ambiguous-intent clarification chips — shown only when the local
          classifier can't pick confidently. Selecting one dispatches the
          original prompt through the matching pipeline. */}
      {view === 'ambiguous' && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Do you want me to…</span>
          {(
            [
              { intent: 'ask' as const, label: 'Answer this', icon: AskIcon },
              { intent: 'task' as const, label: 'Create a task', icon: ListTodo },
              { intent: 'email' as const, label: 'Draft an email', icon: Mail },
            ]
          ).map(({ intent, label, icon: Icon }) => (
            <button
              key={intent}
              type="button"
              onClick={() => {
                const text = pendingText;
                setView('input');
                setPendingText('');
                dispatchIntent(intent, text, attachments.length > 0 ? attachments : undefined);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setView('input'); setPendingText(''); }}
            className="ml-auto text-muted-foreground/70 hover:text-foreground"
            aria-label="Cancel clarification"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* @mention popup */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 border border-[hsl(263,40%,30%,0.4)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.9)_0%,hsl(263,18%,8%,0.95)_100%)] backdrop-blur-xl rounded-lg shadow-lg p-1 z-10">
          {filteredMembers.map(m => (
            <button key={m.user_id} className="w-full text-left px-2.5 py-2 text-xs rounded-md hover:bg-primary/10 flex items-center gap-2 transition-colors" onClick={() => insertMention(m)}>
              <span className="font-medium">{m.display_name}</span>
              <span className="text-muted-foreground">{m.email}</span>
            </button>
          ))}
        </div>
      )}

      {/* Slash command palette */}
      {showSlashHint && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 border border-[hsl(263,40%,30%,0.4)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.9)_0%,hsl(263,18%,8%,0.95)_100%)] backdrop-blur-xl rounded-lg shadow-lg p-1.5 z-10">
          <div className="text-[10px] text-muted-foreground px-2 pb-1 font-medium uppercase tracking-wider">Commands</div>
          {filteredCommands.map((c, idx) => (
            <button
              key={c.cmd}
              className={cn(
                "w-full text-left px-2.5 py-2 text-xs rounded-md flex items-center gap-2.5 transition-colors",
                idx === selectedCmdIdx ? "bg-primary/15 text-foreground" : "hover:bg-primary/10"
              )}
              onClick={() => { setInputValue(''); onSend(c.desc); }}
              onMouseEnter={() => setSelectedCmdIdx(idx)}
            >
              <span className="text-sm">{c.icon}</span>
              <span className="font-mono text-primary font-medium">{c.cmd}</span>
              <span className="text-muted-foreground flex-1">{c.desc}</span>
            </button>
          ))}
          <div className="text-[10px] text-muted-foreground px-2 pt-1.5 border-t border-border/30 mt-1">
            ↑↓ navigate · ↵ select · esc close
          </div>
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-2 px-4 py-3 min-h-[48px] rounded-xl',
          'border border-white/10 bg-white/[0.03] backdrop-blur-md',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
          'transition-all duration-200',
          'focus-within:border-white/25 focus-within:ring-1 focus-within:ring-white/10',
          'focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_20px_-4px_rgba(120,90,255,0.25),inset_0_1px_0_0_rgba(255,255,255,0.08)]',
        )}
      >
        <div className="relative flex-1">
          <Sparkles className="absolute left-0 top-1.5 h-4 w-4 text-white/50" />
          <Textarea
            ref={textareaRef as any}
            placeholder={
              isListening
                ? 'Listening...'
                : 'Ask, draft, or create a follow-up… (/ for commands, @ to mention)'
            }
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            rows={1}
            className={cn(
              'pl-7 pr-2 py-0 min-h-[24px] max-h-[120px] resize-none border-0 text-sm leading-6',
              'text-white/90 placeholder:text-white/40 caret-primary',
              'focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none',
              isListening && "placeholder:text-destructive placeholder:animate-pulse"
            )}
            disabled={isLoading}
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Clear button */}
          {hasInput && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md text-white/60 hover:text-white/90 hover:bg-white/5 transition-all duration-150"
                  onClick={() => { setInputValue(''); textareaRef.current?.focus(); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear input</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <FileAttachmentButton
                  attachments={attachments}
                  onAttach={(newFiles) => setAttachments(prev => [...prev, ...newFiles])}
                  onRemove={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
                  disabled={isLoading}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-md transition-all duration-150',
                  isListening
                    ? "bg-destructive/15 text-destructive animate-pulse"
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                )}
                onClick={toggleVoice}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isListening ? 'Stop listening' : 'Voice input'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-md border transition-all duration-150',
                  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_2px_8px_-2px_rgba(120,90,255,0.5)]',
                  hasInput && !isLoading
                    ? 'bg-gradient-to-br from-[hsl(263,70%,60%)] to-[hsl(263,70%,45%)] hover:from-[hsl(263,75%,65%)] hover:to-[hsl(263,75%,50%)] border-white/20 text-white cursor-pointer opacity-100'
                    : 'bg-white/[0.04] border-white/10 text-white/30 cursor-not-allowed shadow-none'
                )}
                onClick={handleSubmit}
                disabled={!hasInput || isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
