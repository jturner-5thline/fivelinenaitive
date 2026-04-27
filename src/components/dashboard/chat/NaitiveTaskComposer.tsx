import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Loader2, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useNaitiveTaskParse, createTaskFromDraft, type ParseContext, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { TaskModeChips } from './TaskModeChips';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  context?: ParseContext;
  autoFocus?: boolean;
  className?: string;
  onCreated?: (taskId: string) => void;
  placeholder?: string;
  syncSource?: string;
  sourceThreadId?: string | null;
  /**
   * Optional initial text — used by the dashboard composer when intent
   * inference routes a typed prompt into the task flow so the user doesn't
   * have to retype.
   */
  initialText?: string;
}

export function NaitiveTaskComposer({ context = {}, autoFocus, className, onCreated, placeholder, syncSource, sourceThreadId, initialText }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialText ?? '');
  const [creating, setCreating] = useState(false);
  const [previewSeen, setPreviewSeen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const stableCtx = useMemo(() => context, [context.deal_id, context.contact_id, context.thread_id]);
  const { draft, setDraft, loading } = useNaitiveTaskParse(text, stableCtx);

  useEffect(() => {
    if (autoFocus) setTimeout(() => taRef.current?.focus(), 50);
  }, [autoFocus]);

  // Reset previewSeen if user keeps editing after seeing preview
  useEffect(() => { setPreviewSeen(false); }, [text]);

  const doCreate = useCallback(async (d: TaskDraft) => {
    if (!user) return;
    setCreating(true);
    try {
      let result: { id: string; assigned_to: string };
      try {
        result = (await createTaskFromDraft(d, user.id, company?.id || null, {
          syncSource,
          sourceThreadId: sourceThreadId ?? context.thread_id ?? null,
        })) as any;
      } catch (err: any) {
        const msg = err?.message || 'Failed to create task';
        toast.error('Could not create task', { description: msg });
        // Do NOT clear input on failure
        return;
      }

      // Invalidate task queries so My Tasks widget refreshes immediately
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['contact-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['deal-tasks'] });

      // Fire Asana sync (fire-and-forget)
      try {
        const ctx = await getAsanaSyncContext(company?.id || null);
        if (ctx) {
          const { data: profile } = await supabase
            .from('profiles').select('email').eq('user_id', d.owner_id || user.id).maybeSingle();
          await syncTaskToAsana(ctx, {
            id: result.id,
            title: d.title,
            assignee_email: profile?.email || null,
          });
        }
      } catch (e) {
        console.error('[NaitiveTaskComposer] Asana sync failed', e);
      }

      const dueLabel = d.due_date
        ? new Date(d.due_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })
        : null;
      toast.success(`Task created: "${d.title}"${dueLabel ? ` — due ${dueLabel}` : ''}`, {
        action: { label: 'View task →', onClick: () => { window.location.href = `/tasks?task=${result.id}`; } },
      });
      setText('');
      setDraft(null);
      setPreviewSeen(false);
      onCreated?.(result.id);
    } finally {
      setCreating(false);
    }
  }, [user, company?.id, setDraft, onCreated, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!draft || creating) return;
      // Cmd/Ctrl+Enter → skip preview
      if (e.metaKey || e.ctrlKey) { void doCreate(draft); return; }
      if (!previewSeen) { setPreviewSeen(true); return; }
      void doCreate(draft);
    }
  };

  const canCreate = !!draft && !creating;
  const ph = placeholder || "Tell naitive what to do… (e.g., 'Remind me to follow up with Prospeq on Upflex DD by Tuesday')";

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-end gap-2 border border-[hsl(263,40%,30%,0.3)] bg-[linear-gradient(135deg,hsl(260,20%,10%,0.3)_0%,hsl(263,18%,8%,0.4)_100%)] backdrop-blur-sm rounded-xl px-1 transition-all duration-200 focus-within:border-[hsl(263,50%,40%,0.5)] focus-within:shadow-[0_0_12px_hsl(263,40%,30%,0.15)]">
        <div className="relative flex-1">
          <ListTodo className="absolute left-3 top-3 h-4 w-4 text-primary" />
          <Textarea
            ref={taRef}
            placeholder={ph}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="pl-10 pr-3 min-h-[40px] max-h-[120px] resize-none border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            disabled={creating}
          />
        </div>
        <div className="pb-1.5 pr-1">
          <Button
            type="button"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-lg border border-primary/30 transition-all duration-150',
              canCreate
                ? 'bg-primary/20 hover:bg-primary/30 text-primary opacity-100'
                : 'bg-primary/10 text-primary/40 cursor-not-allowed opacity-30'
            )}
            disabled={!canCreate}
            onClick={() => { if (draft) { if (!previewSeen) setPreviewSeen(true); else void doCreate(draft); } }}
            title={previewSeen ? 'Create task' : 'Preview & create (Enter)'}
          >
            {creating || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Preview */}
      {draft && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium leading-snug">{draft.title}</div>
            {previewSeen && (
              <Button
                size="sm"
                className="h-7 shrink-0"
                onClick={() => doCreate(draft)}
                disabled={creating}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create task'}
              </Button>
            )}
          </div>
          <TaskModeChips draft={draft} onChange={setDraft} loading={loading} />
          <div className="text-[10px] text-muted-foreground pt-1">
            {previewSeen ? 'Press ↵ again or click Create. ⌘↵ skips preview.' : 'Press ↵ to preview, ⌘↵ to create immediately.'}
          </div>
        </div>
      )}
    </div>
  );
}