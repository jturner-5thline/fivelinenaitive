import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
}

export function ChatInputBar({ onSend, isLoading, inputValue, setInputValue }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isLoading) onSend(inputValue.trim());
    }
  };

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in your browser');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setInputValue(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); toast.error('Voice recognition failed'); };

    recognition.start();
    setIsListening(true);
  }, [isListening, setInputValue]);

  // Handle slash commands display
  const showSlashHint = inputValue.startsWith('/') && inputValue.length < 10;
  const slashCommands = [
    { cmd: '/deals', desc: 'Summarize my deals' },
    { cmd: '/tasks', desc: 'Show my tasks' },
    { cmd: '/lenders', desc: 'Top lender activity' },
    { cmd: '/milestones', desc: 'Upcoming milestones' },
  ];
  const filteredCommands = slashCommands.filter(c => c.cmd.startsWith(inputValue.toLowerCase()));

  return (
    <div className="relative">
      {/* Slash command hints */}
      {showSlashHint && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-md p-1 z-10">
          {filteredCommands.map(c => (
            <button
              key={c.cmd}
              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent flex items-center gap-2"
              onClick={() => { setInputValue(''); onSend(c.desc); }}
            >
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
            placeholder="Ask anything... (type / for shortcuts)"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="pl-10 pr-3 min-h-[40px] max-h-[120px] resize-none border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            disabled={isLoading}
          />
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleVoice}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80"
            onClick={() => { if (inputValue.trim() && !isLoading) onSend(inputValue.trim()); }}
            disabled={!inputValue.trim() || isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
