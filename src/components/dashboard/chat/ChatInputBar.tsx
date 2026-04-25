import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Mic, MicOff, X } from 'lucide-react';
import { FileAttachmentButton, AttachedFile } from './FileAttachmentButton';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { NaitiveTaskComposer } from './NaitiveTaskComposer';

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

export function ChatInputBar({ onSend, isLoading, inputValue, setInputValue, teamMembers = [], inputRef: externalRef }: Props) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [mode, setMode] = useState<'ask' | 'task' | 'email'>('ask');

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
      if (inputValue.trim() && !isLoading) { onSend(inputValue.trim(), attachments.length > 0 ? attachments : undefined); setAttachments([]); }
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
      {/* Mode switcher — Ask | Task | Email */}
      <div className="mb-1.5 inline-flex items-center gap-0.5 rounded-full border border-[hsl(263,40%,30%,0.3)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.4)_0%,hsl(263,18%,8%,0.5)_100%)] backdrop-blur-sm p-0.5 text-[11px]">
        {(['ask', 'task', 'email'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              if (m === 'email') {
                // lightweight: switch to ask + prefill /email
                setMode('ask');
                setInputValue('/email ');
                setTimeout(() => textareaRef.current?.focus(), 30);
                return;
              }
              setMode(m);
            }}
            className={cn(
              'px-2.5 py-1 rounded-full font-medium transition-colors',
              mode === m
                ? 'bg-primary/25 text-primary'
                : 'text-muted-foreground hover:text-foreground/80'
            )}
          >
            {m === 'ask' ? 'Ask' : m === 'task' ? 'Task' : 'Email'}
          </button>
        ))}
      </div>

      {/* Task mode renders the dedicated composer */}
      {mode === 'task' ? (
        <NaitiveTaskComposer autoFocus />
      ) : (
        <>
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

      <div className="flex items-end gap-2 border border-[hsl(263,40%,30%,0.3)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.3)_0%,hsl(263,18%,8%,0.4)_100%)] backdrop-blur-sm rounded-xl px-1 transition-all duration-200 focus-within:border-[hsl(263,50%,40%,0.5)] focus-within:shadow-[0_0_12px_hsl(263,40%,30%,0.15)]">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-3 h-4 w-4 text-primary" />
          <Textarea
            ref={textareaRef as any}
            placeholder={isListening ? 'Listening...' : 'Ask anything... (/ for commands, @ to mention)'}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className={cn(
              "pl-10 pr-3 min-h-[40px] max-h-[120px] resize-none border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent",
              isListening && "placeholder:text-destructive placeholder:animate-pulse"
            )}
            disabled={isLoading}
          />
        </div>
        <div className="flex items-center gap-1 pb-1.5">
          {/* Clear button */}
          {hasInput && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground/40 hover:text-muted-foreground/80 transition-all duration-150"
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
                  "h-8 w-8 rounded-lg transition-all duration-150",
                  isListening
                    ? "bg-destructive/15 text-destructive animate-pulse"
                    : "text-muted-foreground hover:text-foreground/90"
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
                  "h-8 w-8 rounded-lg border border-primary/30 transition-all duration-150",
                  hasInput && !isLoading
                    ? "bg-primary/20 hover:bg-primary/30 text-primary cursor-pointer opacity-100"
                    : "bg-primary/10 text-primary/40 cursor-not-allowed opacity-30"
                )}
                onClick={() => { if (hasInput && !isLoading) { onSend(inputValue.trim(), attachments.length > 0 ? attachments : undefined); setAttachments([]); } }}
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
