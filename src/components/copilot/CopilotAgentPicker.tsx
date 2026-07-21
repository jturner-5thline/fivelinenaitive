import { useMemo, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAgents } from '@/hooks/useAgents';
import { useCopilotStore, type CopilotSelectedAgent } from '@/stores/copilotStore';

/**
 * Small chip rendered just above the Ask naitive bar. Lets the user
 * direct the next prompt at ANY activated agent — the default Ask
 * naitive Copilot, the built-in Admin Agent (Verify Deal Info), or
 * any user-configured custom agent from the `agents` table. The
 * selection is persisted per session and read by the server so it can
 * adopt that agent's system prompt, tone, and access scopes while
 * still pulling shared knowledge from every activated agent.
 */
export function CopilotAgentPicker({ compact = false }: { compact?: boolean }) {
  const selected = useCopilotStore((s) => s.selectedAgent);
  const setSelected = useCopilotStore((s) => s.setSelectedAgent);
  const { data: agents } = useAgents();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo<CopilotSelectedAgent[]>(() => {
    const base: CopilotSelectedAgent[] = [
      { kind: 'default', id: null, name: 'Ask naitive', emoji: '✨' },
      { kind: 'admin', id: 'admin_agent', name: 'Admin Agent', emoji: '🛡️' },
    ];
    const customs: CopilotSelectedAgent[] = (agents || []).map((a) => ({
      kind: 'custom',
      id: a.id,
      name: a.name,
      emoji: a.avatar_emoji || '🤖',
    }));
    return [...base, ...customs];
  }, [agents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const label = selected?.name || 'Ask naitive';
  const emoji = selected?.emoji || '✨';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-sky-100/85 backdrop-blur-md transition-colors hover:bg-sky-500/15 hover:text-white',
            compact && 'px-2 py-0.5 text-[10px]',
          )}
          aria-label={`Talking to ${label}. Click to switch agent.`}
          title={`Talking to ${label}`}
        >
          <span aria-hidden className="text-[13px] leading-none">
            {emoji}
          </span>
          <span className="max-w-[140px] truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 p-0 border border-sky-400/25 bg-[#0b1024]/95 backdrop-blur-xl text-white/90"
      >
        <div className="border-b border-white/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-sky-200/70">
            <Sparkles className="h-3 w-3" />
            <span>Direct this prompt to</span>
          </div>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-7 border-white/10 bg-white/[0.04] text-xs text-white placeholder:text-white/40"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-white/45">
              No matching agents.
            </div>
          )}
          {filtered.map((opt) => {
            const isActive =
              (selected?.kind || 'default') === opt.kind &&
              (selected?.id || null) === (opt.id || null);
            return (
              <button
                key={`${opt.kind}:${opt.id ?? 'default'}`}
                type="button"
                onClick={() => {
                  setSelected(opt);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5',
                  isActive && 'bg-sky-500/10 text-white',
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {opt.emoji || '🤖'}
                </span>
                <span className="flex-1 truncate">{opt.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  {opt.kind === 'default'
                    ? 'default'
                    : opt.kind === 'admin'
                      ? 'built-in'
                      : 'custom'}
                </span>
                {isActive && <Check className="h-3.5 w-3.5 text-sky-300" />}
              </button>
            );
          })}
        </div>
        <div className="border-t border-white/10 px-3 py-2 text-[10px] leading-tight text-white/45">
          The Ask bar can access knowledge from every activated agent —
          switching just changes the persona replying to you.
        </div>
      </PopoverContent>
    </Popover>
  );
}