import { useState } from 'react';
import { Plus, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDailyRundownItems } from '@/hooks/useDailyRundownItems';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * "My Rundown" — jturner-only editable list on the Daily Rundown panel.
 * Reads from `daily_rundown_items` and subscribes to realtime, so items
 * created or updated by the naitive MCP server (OpenClaw) appear here
 * automatically without a manual refresh.
 */
export function MyRundownPanel() {
  const { data, canUse, isLoading, addItem, toggleComplete, deleteItem } = useDailyRundownItems();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canUse) return null;

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    setBusy(true);
    try {
      await addItem(title);
      setDraft('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-lg border px-4 py-3 mb-3"
      style={{
        background: 'linear-gradient(180deg,#050d20 0%,#020611 50%,#000208 100%)',
        borderColor: 'rgba(190,220,255,0.34)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-white/60" />
        <h4 className="text-[11px] uppercase tracking-wider font-semibold text-white/80">
          My Rundown
        </h4>
        <span className="text-[10px] text-white/40 ml-auto">
          Editable · syncs with naitive MCP
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Add a rundown item…"
          className="flex-1 h-8 rounded-md bg-white/[0.04] border border-white/10 px-2.5 text-[12px] text-white placeholder:text-white/40 outline-none focus:border-primary/50"
          disabled={busy}
        />
        <Button size="sm" variant="secondary" className="h-8 px-2" onClick={submit} disabled={busy || !draft.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-[11px] text-white/40">Loading…</div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-[11px] text-white/40">No items yet. Add one above or ask nAItive to append via MCP.</div>
      ) : (
        <ul className="space-y-1.5">
          {(data ?? []).map((item) => {
            const done = item.status === 'complete';
            return (
              <li
                key={item.id}
                className="group flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5"
              >
                <button
                  onClick={() => toggleComplete(item).catch((e) => toast.error(String(e?.message ?? e)))}
                  className={cn(
                    'mt-[2px] h-4 w-4 rounded border flex items-center justify-center shrink-0',
                    done ? 'bg-emerald-500/70 border-emerald-400/70' : 'border-white/25 hover:border-white/50',
                  )}
                  aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {done && <Check className="h-3 w-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-[12.5px] leading-snug', done ? 'line-through text-white/45' : 'text-white/90')}>
                    {item.title}
                  </div>
                  {item.content && (
                    <div className="text-[11px] text-white/55 mt-0.5 whitespace-pre-wrap">{item.content}</div>
                  )}
                  {item.source !== 'user' && (
                    <div className="text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">via {item.source}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteItem(item.id).catch((e) => toast.error(String(e?.message ?? e)))}
                  className="opacity-0 group-hover:opacity-100 transition text-white/40 hover:text-white/80"
                  aria-label="Delete item"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}