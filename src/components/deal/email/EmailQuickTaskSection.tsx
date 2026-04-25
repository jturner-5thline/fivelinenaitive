import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListTodo, Briefcase, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { NaitiveTaskComposer } from '@/components/dashboard/chat/NaitiveTaskComposer';
import type { EmailThread } from './mockEmailData';

interface Props {
  thread: EmailThread;
  dealId?: string;
  dealName?: string;
  /** Workflow-analysis fallback deal id when no explicit linked deal */
  fallbackDealId?: string | null;
  fallbackDealName?: string | null;
  className?: string;
}

/**
 * Quick Task section for the AI Assist right-rail in the Email widget.
 * Renders a collapsed-by-default card; on expand shows pre-inferred deal/contact
 * chips (resolved from the open thread), a NL task input, live chip preview,
 * and Create Task action. All tasks are tagged with sync_source='naitive_email_assist'
 * and the source thread id is appended to the description.
 */
export function EmailQuickTaskSection({
  thread,
  dealId,
  dealName,
  fallbackDealId,
  fallbackDealName,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const resolvedDealId = dealId || fallbackDealId || null;
  const resolvedDealName = dealName || fallbackDealName || null;

  // Find primary external participant — first email whose sender is not the user
  const externalParticipant = useMemo(() => {
    const ext = thread.emails.find(
      (e) => e.from_name && e.from_name !== 'You' && !!e.from_email
    );
    return ext
      ? { name: ext.from_name, email: ext.from_email }
      : { name: thread.latestEmail.from_name, email: thread.latestEmail.from_email };
  }, [thread]);

  // Resolve contact_id by email lookup (best-effort)
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabel, setContactLabel] = useState<string | null>(externalParticipant.name || null);
  const [contactRemoved, setContactRemoved] = useState(false);
  const [dealRemoved, setDealRemoved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!externalParticipant.email) return;
    (async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email')
        .ilike('email', externalParticipant.email)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setContactId(data.id);
        setContactLabel(
          data.full_name ||
            [data.first_name, data.last_name].filter(Boolean).join(' ') ||
            externalParticipant.name ||
            data.email,
        );
      } else {
        // Keep label as the participant name so the user still sees who they're tasking about
        setContactLabel(externalParticipant.name || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalParticipant.email, externalParticipant.name]);

  const showDealChip = !!resolvedDealId && !!resolvedDealName && !dealRemoved;
  const showContactChip = !!contactLabel && !contactRemoved;

  const composerContext = useMemo(
    () => ({
      deal_id: dealRemoved ? null : resolvedDealId,
      contact_id: contactRemoved ? null : contactId,
      thread_id: thread.threadId,
    }),
    [resolvedDealId, contactId, thread.threadId, dealRemoved, contactRemoved],
  );

  return (
    <div
      className={cn(
        'rounded-md border border-white/[0.06] bg-background/40 overflow-hidden min-w-0 max-w-full w-full',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors min-w-0"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <ListTodo className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-foreground leading-tight">Quick Task</div>
          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
            Tell naitive what to do…
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 min-w-0 max-w-full">
          {/* Pre-inferred chips (only shown before/while typing — TaskModeChips
              inside the composer takes over once a draft is parsed) */}
          {(showDealChip || showContactChip) && (
            <div className="flex flex-wrap gap-1.5">
              {showDealChip && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border bg-primary/10 border-primary/30 text-foreground/90 max-w-full">
                  <Briefcase className="h-3 w-3 opacity-80 shrink-0" />
                  <span
                    className="font-medium leading-none"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    Deal: {resolvedDealName}
                  </span>
                  <button
                    type="button"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 shrink-0"
                    onClick={() => setDealRemoved(true)}
                    aria-label="Remove deal"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {showContactChip && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border bg-primary/10 border-primary/30 text-foreground/90 max-w-full">
                  <User className="h-3 w-3 opacity-80 shrink-0" />
                  <span
                    className="font-medium leading-none"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    Contact: {contactLabel}
                  </span>
                  <button
                    type="button"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 shrink-0"
                    onClick={() => setContactRemoved(true)}
                    aria-label="Remove contact"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
            </div>
          )}

          <NaitiveTaskComposer
            context={composerContext}
            autoFocus
            placeholder="e.g., 'Follow up with Ted on the Canela NDA by Tuesday'"
            syncSource="naitive_email_assist"
            sourceThreadId={thread.threadId}
            onCreated={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  );
}