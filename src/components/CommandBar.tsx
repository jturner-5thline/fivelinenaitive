import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, CheckSquare, Mail, Search, BarChart3,
  LayoutDashboard, Briefcase, ListTodo, Users, Bot,
  TrendingUp, Settings, AlertTriangle, Zap, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilotStore } from '@/stores/copilotStore';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  group: string;
  action: () => void;
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { openPanel, addMessage, setMessages, setConversationId } = useCopilotStore();

  // Cmd+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const sendToCopilot = useCallback((prompt: string) => {
    close();
    // Clear previous conversation, open panel, and send prompt
    setMessages([]);
    setConversationId(null);
    openPanel();
    // Add user message after a tick so the panel is open
    setTimeout(() => {
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: prompt,
        timestamp: new Date(),
      };
      useCopilotStore.getState().addMessage(userMsg);
      // Trigger send by dispatching a custom event the panel listens to
      window.dispatchEvent(new CustomEvent('copilot-send-prompt', { detail: { prompt } }));
    }, 100);
  }, [close, openPanel, setMessages, setConversationId]);

  const items: CommandItem[] = useMemo(() => [
    // Quick Actions
    { id: 'new-deal', label: 'New Deal', icon: <Plus className="h-4 w-4" />, group: 'Quick Actions', action: () => { close(); window.dispatchEvent(new CustomEvent('command-bar-action', { detail: 'new-deal' })); } },
    { id: 'new-task', label: 'New Task', icon: <CheckSquare className="h-4 w-4" />, group: 'Quick Actions', action: () => { close(); window.dispatchEvent(new CustomEvent('command-bar-action', { detail: 'new-task' })); } },
    { id: 'draft-email', label: 'Draft Email', icon: <Mail className="h-4 w-4" />, group: 'Quick Actions', action: () => sendToCopilot('Draft an email') },
    { id: 'search-deals', label: 'Search Deals', icon: <Search className="h-4 w-4" />, group: 'Quick Actions', action: () => sendToCopilot('Search my deals') },
    { id: 'pipeline-summary', label: 'Pipeline Summary', icon: <BarChart3 className="h-4 w-4" />, group: 'Quick Actions', action: () => sendToCopilot('Give me a pipeline summary') },

    // Navigation
    { id: 'nav-deals', label: 'Go to Deals', icon: <Briefcase className="h-4 w-4" />, group: 'Navigation', action: () => { close(); navigate('/deals'); } },
    { id: 'nav-tasks', label: 'Go to Tasks', icon: <ListTodo className="h-4 w-4" />, group: 'Navigation', action: () => { close(); navigate('/tasks'); } },
    { id: 'nav-lenders', label: 'Go to Lenders', icon: <Users className="h-4 w-4" />, group: 'Navigation', action: () => { close(); navigate('/lenders'); } },
    { id: 'nav-agents', label: 'Go to Agents', icon: <Bot className="h-4 w-4" />, group: 'Navigation', action: () => { close(); navigate('/agents'); } },
    { id: 'nav-insights', label: 'Go to Insights', icon: <TrendingUp className="h-4 w-4" />, group: 'Navigation', action: () => { close(); navigate('/insights'); } },
    { id: 'nav-settings', label: 'Go to Settings', icon: <Settings className="h-4 w-4" />, group: 'Navigation', action: () => { close(); navigate('/settings'); } },

    // AI Prompts
    { id: 'ai-attention', label: 'What needs attention today?', icon: <Zap className="h-4 w-4" />, group: 'AI Prompts', action: () => sendToCopilot('What needs attention today?') },
    { id: 'ai-stale', label: 'Stale deals this week', icon: <Clock className="h-4 w-4" />, group: 'AI Prompts', action: () => sendToCopilot('Show me stale deals this week') },
    { id: 'ai-revenue', label: 'Revenue forecast', icon: <TrendingUp className="h-4 w-4" />, group: 'AI Prompts', action: () => sendToCopilot('What is my revenue forecast?') },
    { id: 'ai-risk', label: 'Risk assessment', icon: <AlertTriangle className="h-4 w-4" />, group: 'AI Prompts', action: () => sendToCopilot('Run a risk assessment on my pipeline') },
  ], [close, navigate, sendToCopilot]);

  // Fuzzy filter
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(item => item.label.toLowerCase().includes(q));
  }, [query, items]);

  // Group filtered items
  const grouped = useMemo(() => {
    const groups: { name: string; items: CommandItem[] }[] = [];
    const order = ['Quick Actions', 'Navigation', 'AI Prompts'];
    for (const name of order) {
      const groupItems = filtered.filter(i => i.group === name);
      if (groupItems.length > 0) groups.push({ name, items: groupItems });
    }
    return groups;
  }, [filtered]);

  const flatFiltered = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= flatFiltered.length) setSelectedIndex(Math.max(0, flatFiltered.length - 1));
  }, [flatFiltered.length, selectedIndex]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flatFiltered[selectedIndex]?.action();
    } else if (e.key === 'Escape') {
      close();
    }
  }, [flatFiltered, selectedIndex, close]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={close}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60" />

      {/* Modal */}
      <div
        className="relative w-[560px] max-w-[90vw] overflow-hidden"
        style={{
          background: 'rgba(8, 10, 18, 0.95)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
          borderRadius: '12px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search or ask anything..."
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-2">
          {flatFiltered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results found.</p>
          )}
          {grouped.map(group => (
            <div key={group.name}>
              <p className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.name}
              </p>
              {group.items.map(item => {
                const idx = flatFiltered.indexOf(item);
                return (
                  <button
                    key={item.id}
                    data-index={idx}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground transition-colors cursor-default',
                      idx === selectedIndex
                        ? 'bg-primary/15 text-primary-foreground'
                        : 'hover:bg-muted/20'
                    )}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="text-muted-foreground">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
