import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  teamMembers?: TeamMember[];
}

export function ChatInputBar({ onSend, isLoading, inputValue, setInputValue, teamMembers = [] }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isLoading) onSend(inputValue.trim());
    }
  };

  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Speech recognition not supported'); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = 'en-US';
    recognitionRef.current = r;
    r.onresult = (e: any) => { setInputValue(Array.from(e.results).map((r: any) => r[0].transcript).join('')); };
    r.onend = () => setIsListening(false);
    r.onerror = () => { setIsListening(false); toast.error('Voice failed'); };
    r.start(); setIsListening(true);
  }, [isListening, setInputValue]);

  const showSlashHint = inputValue.startsWith('/') && inputValue.length < 12;
  const slashCommands = [
    { cmd: '/briefing', desc: 'Daily morning briefing' },
    { cmd: '/deals', desc: 'Summarize my deals' },
    { cmd: '/tasks', desc: 'Show my tasks' },
    { cmd: '/lenders', desc: 'Top lender activity' },
    { cmd: '/milestones', desc: 'Upcoming milestones' },
    { cmd: '/alerts', desc: 'Show anomalies & risks' },
    { cmd: '/match', desc: 'Find lenders for a deal' },
    { cmd: '/catchup', desc: 'What happened while I was away?' },
  ];
  const filteredCommands = slashCommands.filter(c => c.cmd.startsWith(inputValue.toLowerCase()));

  return (
    <div className="relative">
      {/* @mention popup */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-md p-1 z-10">
          {filteredMembers.map(m => (
            <button key={m.user_id} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent flex items-center gap-2" onClick={() => insertMention(m)}>
              <span className="font-medium">{m.display_name}</span>
              <span className="text-muted-foreground">{m.email}</span>
            </button>
          ))}
        </div>
      )}

      {/* Slash commands */}
      {showSlashHint && !showMentions && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-md p-1 z-10">
          {filteredCommands.map(c => (
            <button key={c.cmd} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent flex items-center gap-2" onClick={() => { setInputValue(''); onSend(c.desc); }}>
              <span className="font-mono text-primary">{c.cmd}</span>
              <span className="text-muted-foreground">{c.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-3 h-4 w-4 text-primary" />
          <Textarea
            ref={textareaRef}
            placeholder="Ask anything... (/ for shortcuts, @ to mention)"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="pl-10 pr-3 min-h-[40px] max-h-[120px] resize-none border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            disabled={isLoading}
          />
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={toggleVoice} title={isListening ? 'Stop' : 'Voice'}>
            {isListening ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80" onClick={() => { if (inputValue.trim() && !isLoading) onSend(inputValue.trim()); }} disabled={!inputValue.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
