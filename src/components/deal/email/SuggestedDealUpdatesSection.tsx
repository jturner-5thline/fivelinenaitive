import { useState, useMemo } from 'react';
import { Check, Edit3, X, FileText, Loader2, Mail, MessageSquareQuote, Settings, Inbox as InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  usePendingDealSuggestions,
  type PendingDealSuggestion,
  type PendingDealSuggestionPayload,
  type PendingQAPayload,
} from '@/hooks/usePendingDealSuggestions';
import { useDealSpaceNotes } from '@/hooks/useDealSpaceNotes';
import { useDealAuditLog } from '@/hooks/useDealAuditLog';
import { useAutoDealNoteSuggestionPref } from '@/hooks/useAutoDealNoteSuggestionPref';
import { format } from 'date-fns';
import {
  parseExistingQAForThread,
  diffQAPairs,
  classifyPair,
  type QADiffResult,
} from '@/lib/diffThreadQAndA';
import { usePendingDealResolutionsStore } from '@/stores/pendingDealResolutionsStore';
import { DealPickerCard } from './DealPickerCard';
import { useEnqueueAiAction } from '@/hooks/useAiActionQueue';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';

interface Props {
  dealId?: string;
  dealName?: string;
  /** Current thread context — enables the multi-deal picker prompt. */
  threadId?: string;
}

const CONTACTS_NOTE_TITLE = 'Deal Contacts';
const QA_NOTE_TITLE = 'Client Q&A';

/**
 * Build a stable deep-link to the source email thread for audit-trail entries.
 * Format: `/deal/<dealId>?tab=emails&thread=<threadId>`. The audit-trail UI
 * can render this as a clickable link; future work in DealEmailsTab can read
 * the `thread` query param to auto-open the thread on navigation.
 */
function buildSourceThreadUrl(dealId: string | undefined, threadId: string | null | undefined): string | null {
  if (!dealId || !threadId) return null;
  return `/deal/${dealId}?tab=emails&thread=${encodeURIComponent(threadId)}`;
}

function buildNoteEntry(payload: PendingDealSuggestionPayload, threadSubject: string | null): string {
  const ts = format(new Date(), 'PPp');
  const lines = [
    `**${payload.contactName || payload.inferredName || 'Contact'}** — <${payload.email}>`,
    threadSubject ? `_Source thread: ${threadSubject}_` : null,
    payload.contextSnippet ? `> ${payload.contextSnippet}` : null,
    `_Captured ${ts}_`,
    '',
  ].filter(Boolean);
  return lines.join('\n');
}

function buildQANoteEntry(payload: PendingQAPayload): string {
  const ts = format(new Date(), 'PPp');
  const dateStr = payload.source.receivedAt
    ? format(new Date(payload.source.receivedAt), 'PP')
    : '';
  const lines: string[] = [
    `### Client Q&A — ${dateStr || ts}`,
    `_From **${payload.source.fromName}** <${payload.source.fromEmail}> · Re: ${payload.source.subject}_`,
    '',
  ];
  payload.pairs.forEach((p, i) => {
    lines.push(`**Q${i + 1}.** ${p.question}`);
    lines.push(`**A.** ${p.answer}`);
    lines.push('');
  });
  lines.push(`_Source thread: ${payload.source.threadId}_`);
  lines.push(`_Captured ${ts}_`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Delta-only entry used in Merge mode: writes ONLY the changed/new pairs
 * under a "Q&A — Update" sub-heading, preserving the previous entries.
 */
function buildQAMergeEntry(payload: PendingQAPayload, diff: QADiffResult): string {
  const ts = format(new Date(), 'PPp');
  const dateStr = payload.source.receivedAt
    ? format(new Date(payload.source.receivedAt), 'PP')
    : '';
  const lines: string[] = [
    `### Client Q&A — Update — ${dateStr || ts}`,
    `_From **${payload.source.fromName}** <${payload.source.fromEmail}> · Re: ${payload.source.subject}_`,
    `_${diff.changed.length} updated · ${diff.added.length} new · ${diff.unchanged.length} unchanged_`,
    '',
  ];
  let n = 1;
  diff.changed.forEach(({ previous, next }) => {
    lines.push(`**Q${n}.** ${next.question}  _(updated)_`);
    lines.push(`**A.** ${next.answer}`);
    lines.push(`> _Previous:_ ${previous}`);
    lines.push('');
    n++;
  });
  diff.added.forEach(pair => {
    lines.push(`**Q${n}.** ${pair.question}  _(new)_`);
    lines.push(`**A.** ${pair.answer}`);
    lines.push('');
    n++;
  });
  lines.push(`_Source thread: ${payload.source.threadId}_`);
  lines.push(`_Captured ${ts}_`);
  lines.push('');
  return lines.join('\n');
}

export function SuggestedDealUpdatesSection({ dealId, dealName, threadId }: Props) {
  const { enabled, setEnabled } = useAutoDealNoteSuggestionPref();
  const { suggestions, dismiss, confirm, updatePayload } = usePendingDealSuggestions(dealId);
  const { notes, createNote, updateNote } = useDealSpaceNotes(dealId);
  const { logAuditAction } = useDealAuditLog(dealId);

  // Pending deal-picker prompts for this thread (multiple-match fallback).
  //
  // IMPORTANT: subscribe to the raw `resolutions` map (a stable reference
  // unless its contents change) and derive the filtered/sorted list via
  // `useMemo`. Calling `s.byThread(threadId)` directly inside the selector
  // returns a NEW array reference on every store read, which makes
  // useSyncExternalStore treat the snapshot as unstable and triggers an
  // infinite re-render loop ("Maximum update depth exceeded") the moment
  // any zustand store anywhere in the tree updates.
  const resolutionsMap = usePendingDealResolutionsStore((s) => s.resolutions);
  const pendingResolutions = useMemo(() => {
    if (!threadId) return [];
    return Object.values(resolutionsMap)
      .filter((r) => r.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [resolutionsMap, threadId]);

  // Only render the section when there is at least one actual suggested update
  // or a pending deal-picker resolution. When empty, hide the entire section
  // (heading, settings toggle, and helper text) so the AI Assist sidebar
  // doesn't show a "None right now…" placeholder.
  const hasItems = suggestions.length > 0 || pendingResolutions.length > 0;
  const totalCount = suggestions.length;

  if (!hasItems) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Suggested Deal Updates
          {totalCount > 1 && (
            <span className="ml-1.5 text-muted-foreground/50 normal-case tracking-normal">
              · {totalCount} pending
            </span>
          )}
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="text-muted-foreground/70 hover:text-foreground transition-colors p-0.5"
              aria-label="Automation settings"
            >
              <Settings className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto-suggest-toggle" className="text-xs leading-tight cursor-pointer">
                  Auto-suggest deal note from detected emails
                </Label>
                <Switch
                  id="auto-suggest-toggle"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/80 leading-snug">
                When you type a contact's email on its own line in a reply, we'll suggest adding it to the deal's notes — never written automatically.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {pendingResolutions.length > 0 && (
        <div className="space-y-2 mb-2">
          {pendingResolutions.map((r) => (
            <DealPickerCard key={r.id} resolution={r} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map((s, idx) => {
          const pagerLabel = totalCount > 1 ? `${idx + 1}/${totalCount}` : null;
          if (s.suggestion_type === 'qa_from_thread') {
            return (
              <QASuggestionCard
                key={s.id}
                suggestion={s}
                dealName={dealName}
                pagerLabel={pagerLabel}
                existingQANoteId={notes.find(n => n.title === QA_NOTE_TITLE)?.id}
                existingQANoteContent={notes.find(n => n.title === QA_NOTE_TITLE)?.content}
                onDismiss={async () => {
                  await dismiss(s.id);
                  toast.info('Suggestion dismissed');
                }}
                onSavePayload={async (next) => {
                  await updatePayload(s.id, next as any);
                }}
                onConfirm={async (finalPayload, mode) => {
                  if (!dealId) return;
                  try {
                    const existing = notes.find(n => n.title === QA_NOTE_TITLE);
                    const parsed = parseExistingQAForThread(
                      existing?.content,
                      finalPayload.source.threadId,
                    );
                    const diff = diffQAPairs(finalPayload.pairs, parsed);

                    // Merge mode writes ONLY changed + new pairs. If nothing
                    // changed and nothing is new, skip the write entirely.
                    let noteEntry: string | null;
                    if (mode === 'merge' && parsed.entryCount > 0) {
                      if (diff.changed.length === 0 && diff.added.length === 0) {
                        noteEntry = null;
                      } else {
                        noteEntry = buildQAMergeEntry(finalPayload, diff);
                      }
                    } else {
                      noteEntry = buildQANoteEntry(finalPayload);
                    }

                    let noteId: string | null = null;
                    if (noteEntry === null && existing) {
                      // No-op merge — keep the note as-is.
                      noteId = existing.id;
                    } else if (existing) {
                      const newContent = existing.content
                        ? `${existing.content}\n\n${noteEntry}`
                        : noteEntry;
                      await updateNote(existing.id, { content: newContent });
                      noteId = existing.id;
                    } else {
                      const created = await createNote(QA_NOTE_TITLE, noteEntry!);
                      noteId = created?.id ?? null;
                    }

                    await logAuditAction(
                      'qa_responses_saved_from_thread',
                      'note',
                      noteId || undefined,
                      QA_NOTE_TITLE,
                      {
                        thread_id: finalPayload.source.threadId,
                        thread_subject: finalPayload.source.subject,
                        from_email: finalPayload.source.fromEmail,
                        pair_count: finalPayload.pairs.length,
                        mode, // 'append' | 'merge'
                        prior_entry_count: parsed.entryCount,
                        changed_count: diff.changed.length,
                        added_count: diff.added.length,
                        unchanged_count: diff.unchanged.length,
                        source_thread_url: buildSourceThreadUrl(dealId, finalPayload.source.threadId),
                        confirmed_at: new Date().toISOString(),
                        suggestion_id: s.id,
                      },
                    );

                    await confirm(s.id, noteId);
                    if (mode === 'merge' && noteEntry === null) {
                      toast.info('No changes to merge', {
                        description: 'All Q&A pairs already match the saved note.',
                      });
                    } else {
                      toast.success(
                        mode === 'merge'
                          ? `Merged ${diff.changed.length + diff.added.length} pair(s) into deal notes`
                          : 'Q&A saved to deal notes',
                        { description: dealName ? `Saved to ${dealName} → ${QA_NOTE_TITLE}` : undefined },
                      );
                    }
                  } catch (err: any) {
                    console.error(err);
                    toast.error('Failed to save Q&A to deal notes');
                  }
                }}
              />
            );
          }
          return (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              dealName={dealName}
              pagerLabel={pagerLabel}
              existingContactsNoteId={notes.find(n => n.title === CONTACTS_NOTE_TITLE)?.id}
              existingContactsNoteContent={notes.find(n => n.title === CONTACTS_NOTE_TITLE)?.content}
            onDismiss={async () => {
              await dismiss(s.id);
              toast.info('Suggestion dismissed');
            }}
            onSavePayload={async (next) => {
              await updatePayload(s.id, next);
            }}
            onConfirm={async (finalPayload) => {
              if (!dealId) return;
              try {
                const noteEntry = buildNoteEntry(finalPayload, s.source_thread_subject);

                const existing = notes.find(n => n.title === CONTACTS_NOTE_TITLE);
                let noteId: string | null = null;
                if (existing) {
                  const newContent = existing.content
                    ? `${existing.content}\n\n${noteEntry}`
                    : noteEntry;
                  await updateNote(existing.id, { content: newContent });
                  noteId = existing.id;
                } else {
                  const created = await createNote(CONTACTS_NOTE_TITLE, noteEntry);
                  noteId = created?.id ?? null;
                }

                await logAuditAction(
                  'contact_email_added_from_email_draft',
                  'note',
                  noteId || undefined,
                  CONTACTS_NOTE_TITLE,
                  {
                    email: finalPayload.email,
                    contact_name: finalPayload.contactName || finalPayload.inferredName,
                    source_thread_id: s.source_thread_id,
                    source_thread_subject: s.source_thread_subject,
                    source_thread_url: buildSourceThreadUrl(dealId, s.source_thread_id),
                    confirmed_at: new Date().toISOString(),
                    suggestion_id: s.id,
                  },
                );

                await confirm(s.id, noteId);
                toast.success('Added to deal notes', {
                  description: dealName ? `Saved to ${dealName} → ${CONTACTS_NOTE_TITLE}` : undefined,
                });
              } catch (err: any) {
                console.error(err);
                toast.error('Failed to add to deal notes');
              }
            }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: PendingDealSuggestion;
  dealName?: string;
  pagerLabel?: string | null;
  existingContactsNoteId?: string;
  existingContactsNoteContent?: string;
  onConfirm: (payload: PendingDealSuggestionPayload) => Promise<void>;
  onDismiss: () => Promise<void>;
  onSavePayload: (payload: PendingDealSuggestionPayload) => Promise<void>;
}

function SuggestionCard({
  suggestion,
  dealName,
  pagerLabel,
  onConfirm,
  onDismiss,
  onSavePayload,
}: SuggestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const enqueueAiAction = useEnqueueAiAction();
  const { enabled: approvalQueueEnabled } = useApprovalQueueAccess();
  const contactPayload = suggestion.payload as PendingDealSuggestionPayload;
  const [draft, setDraft] = useState<PendingDealSuggestionPayload>({
    ...contactPayload,
    contactName: contactPayload.contactName || contactPayload.inferredName,
  });

  const handleConfirm = async () => {
    setWorking(true);
    try {
      if (editing) {
        await onSavePayload(draft);
      }
      await onConfirm(draft);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-md border border-white/[0.08] bg-background/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-muted/20">
        <Mail className="h-3 w-3 text-primary/80 shrink-0" />
        <span className="text-[11px] font-medium text-foreground/85 truncate flex-1">
          Add contact to {dealName || 'deal'} notes
        </span>
        {pagerLabel && (
          <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">{pagerLabel}</span>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {/* Target deal */}
        <Row label="Deal" value={dealName || '—'} />
        {!editing ? (
          <>
            <Row label="Contact" value={draft.contactName || draft.inferredName || '—'} />
            <Row label="Email" value={draft.email} mono />
            {suggestion.source_thread_subject && (
              <Row label="Thread" value={suggestion.source_thread_subject} />
            )}
            {draft.contextSnippet && (
              <div className="text-[11px] text-muted-foreground/80 italic leading-snug border-l-2 border-white/[0.08] pl-2 mt-1">
                "{draft.contextSnippet}"
              </div>
            )}
          </>
        ) : (
          <div className="space-y-1.5">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Contact name</Label>
              <Input
                value={draft.contactName || ''}
                onChange={e => setDraft(d => ({ ...d, contactName: e.target.value }))}
                className="h-7 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Email</Label>
              <Input
                value={draft.email}
                onChange={e => setDraft(d => ({ ...d, email: e.target.value.trim() }))}
                className="h-7 text-xs mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Note context</Label>
              <Textarea
                value={draft.contextSnippet}
                onChange={e => setDraft(d => ({ ...d, contextSnippet: e.target.value }))}
                className="text-xs mt-1 min-h-[48px]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-3 py-2 border-t border-white/[0.04] bg-muted/10">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1 px-2"
          onClick={() => setEditing(e => !e)}
          disabled={working}
        >
          {editing ? <X className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
          {editing ? 'Cancel edit' : 'Edit'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-destructive"
          onClick={onDismiss}
          disabled={working}
        >
          <X className="h-3 w-3" />
          Dismiss
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1 px-2"
          title="Add to Approval Queue for batch review"
          disabled={working || !draft.email}
          onClick={async () => {
            setWorking(true);
            try {
              await enqueueAiAction({
                action_type: 'log_note',
                title: `Add ${draft.contactName || draft.email} to ${dealName || 'deal'} notes`,
                description: draft.contextSnippet || null,
                deal_id: (suggestion as any).deal_id || null,
                deal_name: dealName || null,
                payload: { ...draft, activity_type: 'contact_added_from_email' },
                source: { thread_subject: suggestion.source_thread_subject || null },
              });
              await onDismiss();
            } finally {
              setWorking(false);
            }
          }}
        >
          <InboxIcon className="h-3 w-3" /> Queue
        </Button>
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1.5 bg-[hsl(160,60%,40%)] hover:bg-[hsl(160,60%,35%)] text-white"
          onClick={handleConfirm}
          disabled={working || !draft.email}
        >
          {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Confirm & add
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-muted-foreground/70 w-12 shrink-0">{label}</span>
      <span className={mono ? 'text-foreground/90 font-mono break-all' : 'text-foreground/90'}>{value}</span>
    </div>
  );
}

// ─── Q&A suggestion card ─────────────────────────────────────
interface QASuggestionCardProps {
  suggestion: PendingDealSuggestion;
  dealName?: string;
  pagerLabel?: string | null;
  existingQANoteId?: string;
  existingQANoteContent?: string;
  onConfirm: (payload: PendingQAPayload, mode: 'append' | 'merge') => Promise<void>;
  onDismiss: () => Promise<void>;
  onSavePayload: (payload: PendingQAPayload) => Promise<void>;
}

function QASuggestionCard({
  suggestion,
  dealName,
  pagerLabel,
  existingQANoteId,
  existingQANoteContent,
  onConfirm,
  onDismiss,
  onSavePayload,
}: QASuggestionCardProps) {
  const initialPayload = suggestion.payload as PendingQAPayload;
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState<PendingQAPayload>(initialPayload);

  // Detect prior Q&A entries for this exact source thread and compute a diff
  // of incoming pairs vs what was previously saved. Powers "Merge / Update".
  const parsedExisting = parseExistingQAForThread(
    existingQANoteContent,
    initialPayload.source.threadId,
  );
  const diff = diffQAPairs(draft.pairs, parsedExisting);
  const threadAlreadySaved = parsedExisting.entryCount > 0;
  const hasMergeWork = diff.changed.length + diff.added.length > 0;

  const handleConfirm = async (mode: 'append' | 'merge') => {
    setWorking(true);
    try {
      if (editing) {
        await onSavePayload(draft);
      }
      await onConfirm(draft, mode);
    } finally {
      setWorking(false);
    }
  };

  const updatePair = (idx: number, key: 'question' | 'answer', value: string) => {
    setDraft(d => ({
      ...d,
      pairs: d.pairs.map((p, i) => (i === idx ? { ...p, [key]: value } : p)),
    }));
  };

  return (
    <div className="rounded-md border border-white/[0.08] bg-background/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-muted/20">
        <MessageSquareQuote className="h-3 w-3 text-primary/80 shrink-0" />
        <span className="text-[11px] font-medium text-foreground/85 truncate flex-1">
          Save Q&A responses to Deal Notes
        </span>
        <ConfidenceBadge
          confidence={initialPayload.confidence}
          score={initialPayload.confidenceScore}
          signals={initialPayload.confidenceSignals}
        />
        {pagerLabel && (
          <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">{pagerLabel}</span>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <Row label="Deal" value={dealName || '—'} />
        <Row label="From" value={`${draft.source.fromName} <${draft.source.fromEmail}>`} mono />
        {draft.source.subject && <Row label="Re" value={draft.source.subject} />}
        {draft.source.receivedAt && (
          <Row label="Date" value={format(new Date(draft.source.receivedAt), 'PP p')} />
        )}

        {/* Preview of what will be written */}
        <div className="mt-2 border-t border-white/[0.04] pt-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="h-3 w-3 text-muted-foreground/70" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Preview ({draft.pairs.length} pair{draft.pairs.length === 1 ? '' : 's'})
            </span>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {draft.pairs.map((p, i) => {
              const status = classifyPair(p, parsedExisting);
              return (
              <div key={i} className="rounded border border-white/[0.04] bg-background/30 px-2 py-1.5 space-y-1">
                {!editing ? (
                  <>
                    <div className="flex items-start gap-1.5">
                      <div className="text-[11px] text-foreground/85 leading-snug flex-1">
                        <span className="text-muted-foreground/80 font-semibold">Q{i + 1}.</span> {p.question}
                      </div>
                      {threadAlreadySaved && <ChangeBadge status={status} />}
                    </div>
                    <div className="text-[11px] text-foreground/95 leading-snug pl-3 border-l border-primary/30">
                      {p.answer}
                    </div>
                  </>
                ) : (
                  <>
                    <Textarea
                      value={p.question}
                      onChange={e => updatePair(i, 'question', e.target.value)}
                      className="text-[11px] min-h-[36px] py-1"
                      placeholder={`Question ${i + 1}`}
                    />
                    <Textarea
                      value={p.answer}
                      onChange={e => updatePair(i, 'answer', e.target.value)}
                      className="text-[11px] min-h-[44px] py-1"
                      placeholder="Answer"
                    />
                  </>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {threadAlreadySaved && (
          <div className="text-[10px] text-amber-400/90 leading-snug border border-amber-400/20 bg-amber-400/[0.04] rounded px-2 py-1.5">
            {parsedExisting.entryCount} prior entr{parsedExisting.entryCount === 1 ? 'y' : 'ies'} for this thread.
            {' '}
            {hasMergeWork ? (
              <>
                <span className="font-semibold">Merge / Update</span> will write only{' '}
                {diff.changed.length > 0 && (
                  <>{diff.changed.length} updated</>
                )}
                {diff.changed.length > 0 && diff.added.length > 0 && ' · '}
                {diff.added.length > 0 && (
                  <>{diff.added.length} new</>
                )}
                {diff.unchanged.length > 0 && (
                  <span className="text-muted-foreground/70"> ({diff.unchanged.length} unchanged skipped)</span>
                )}
                .
              </>
            ) : (
              <span className="text-muted-foreground/70"> All pairs match — nothing to merge.</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-3 py-2 border-t border-white/[0.04] bg-muted/10 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1 px-2"
          onClick={() => setEditing(e => !e)}
          disabled={working}
        >
          {editing ? <X className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
          {editing ? 'Cancel edit' : 'Edit'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-destructive"
          onClick={onDismiss}
          disabled={working}
        >
          <X className="h-3 w-3" />
          Dismiss
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1.5 bg-[hsl(160,60%,40%)] hover:bg-[hsl(160,60%,35%)] text-white"
          onClick={() => handleConfirm(threadAlreadySaved ? 'merge' : 'append')}
          disabled={working || draft.pairs.length === 0 || (threadAlreadySaved && !hasMergeWork)}
        >
          {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {threadAlreadySaved
            ? `Merge / Update${hasMergeWork ? ` (${diff.changed.length + diff.added.length})` : ''}`
            : 'Confirm & Save to Deal Notes'}
        </Button>
      </div>
    </div>
  );
}

function ChangeBadge({ status }: { status: 'unchanged' | 'changed' | 'new' }) {
  if (status === 'unchanged') {
    return (
      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground/70 shrink-0">
        Unchanged
      </span>
    );
  }
  if (status === 'changed') {
    return (
      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 shrink-0">
        Updated
      </span>
    );
  }
  return (
    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 shrink-0">
      New
    </span>
  );
}

function ConfidenceBadge({
  confidence,
  score,
  signals,
}: {
  confidence?: 'high' | 'medium' | 'low';
  score?: number;
  signals?: { label: string; weight: number; hit: boolean }[];
}) {
  if (!confidence) return null;
  const styles =
    confidence === 'high'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : confidence === 'medium'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
      : 'bg-red-500/15 text-red-300 border-red-500/25';
  const label = confidence === 'high' ? 'High' : confidence === 'medium' ? 'Med' : 'Low';
  const pct = typeof score === 'number' ? Math.round(score * 100) : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 cursor-help ${styles}`}
            aria-label={`Detection confidence: ${label}${pct !== null ? ` (${pct}%)` : ''}`}
          >
            {label}
            {pct !== null && <span className="ml-1 opacity-70 normal-case tracking-normal">{pct}%</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium">
              Detection confidence: {label}
              {pct !== null && <span className="text-muted-foreground ml-1">({pct}%)</span>}
            </div>
            <div className="text-[10px] text-muted-foreground leading-snug">
              Based on keyword cues, pairing mode, count alignment, and answer quality.
            </div>
            {signals && signals.length > 0 && (
              <ul className="space-y-0.5 pt-1 border-t border-border/40">
                {signals.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span className={s.hit ? 'text-emerald-400' : 'text-muted-foreground/50'}>
                      {s.hit ? '✓' : '·'}
                    </span>
                    <span className={s.hit ? 'text-foreground/85' : 'text-muted-foreground/70 line-through'}>
                      {s.label}
                    </span>
                    <span className="ml-auto text-muted-foreground/60 font-mono">
                      {Math.round(s.weight * 100)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}