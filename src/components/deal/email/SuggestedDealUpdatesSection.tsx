import { useState } from 'react';
import { Check, Edit3, X, FileText, Loader2, Mail, Settings } from 'lucide-react';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  usePendingDealSuggestions,
  type PendingDealSuggestion,
  type PendingDealSuggestionPayload,
} from '@/hooks/usePendingDealSuggestions';
import { useDealSpaceNotes } from '@/hooks/useDealSpaceNotes';
import { useDealAuditLog } from '@/hooks/useDealAuditLog';
import { useAutoDealNoteSuggestionPref } from '@/hooks/useAutoDealNoteSuggestionPref';
import { format } from 'date-fns';

interface Props {
  dealId?: string;
  dealName?: string;
}

const CONTACTS_NOTE_TITLE = 'Deal Contacts';

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

export function SuggestedDealUpdatesSection({ dealId, dealName }: Props) {
  const { enabled, setEnabled } = useAutoDealNoteSuggestionPref();
  const { suggestions, dismiss, confirm, updatePayload } = usePendingDealSuggestions(dealId);
  const { notes, createNote, updateNote } = useDealSpaceNotes(dealId);
  const { logAuditAction } = useDealAuditLog(dealId);

  // Always render the header (so the toggle is reachable). Cards only render when present.
  const hasItems = suggestions.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Suggested Deal Updates
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

      {!hasItems && (
        <div className="rounded-md border border-dashed border-white/[0.06] bg-background/20 px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground/70 leading-snug">
            None right now. Add a contact's email on its own line in a reply to capture them here.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map(s => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            dealName={dealName}
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
        ))}
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: PendingDealSuggestion;
  dealName?: string;
  existingContactsNoteId?: string;
  existingContactsNoteContent?: string;
  onConfirm: (payload: PendingDealSuggestionPayload) => Promise<void>;
  onDismiss: () => Promise<void>;
  onSavePayload: (payload: PendingDealSuggestionPayload) => Promise<void>;
}

function SuggestionCard({
  suggestion,
  dealName,
  onConfirm,
  onDismiss,
  onSavePayload,
}: SuggestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState<PendingDealSuggestionPayload>({
    ...suggestion.payload,
    contactName: suggestion.payload.contactName || suggestion.payload.inferredName,
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
        <span className="text-[11px] font-medium text-foreground/85 truncate">
          Add contact to {dealName || 'deal'} notes
        </span>
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