import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, ExternalLink, FileText, FolderOpen, Loader2, Paperclip, Highlighter, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useEmailToDataRoom } from '@/hooks/useEmailToDataRoom';
import type { EmailThread, EmailAttachment } from './mockEmailData';

type SourceKind = 'attachments' | 'body' | 'highlighted';
type Destination = 'data_room' | 'notes';

interface LastSaved {
  destination: Destination;
  dealId: string;
  dealName: string;
  label: string; // human-readable target (file name or "note")
  count?: number; // for multi-file uploads
}

interface Props {
  thread: EmailThread;
  attachments: EmailAttachment[]; // already filtered uploadable list ideally
  messageId: string;
  matchedDealId?: string;
  matchedDealName?: string;
  fallbackDealId?: string | null;
  fallbackDealName?: string | null;
}

function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}

function buildContextHeader(thread: EmailThread): string {
  const e = thread.latestEmail;
  const date = e.received_at ? format(new Date(e.received_at), 'PPpp') : '';
  return [
    `From: ${e.from_name || ''} <${e.from_email || ''}>`.trim(),
    `Subject: ${thread.subject || '(no subject)'}`,
    date ? `Date: ${date}` : '',
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');
}

function timestampSuffix(): string {
  return format(new Date(), 'yyyyMMdd-HHmmss');
}

export function SaveToDealCard({
  thread,
  attachments,
  messageId,
  matchedDealId,
  matchedDealName,
  fallbackDealId,
  fallbackDealName,
}: Props) {
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const { commitUpload, uploading } = useEmailToDataRoom();

  const initialDealId = matchedDealId || fallbackDealId || '';
  const initialDealName = matchedDealName || fallbackDealName || '';

  const uploadable = useMemo(
    () => attachments.filter((a) => !a.is_inline && !!a.id),
    [attachments],
  );

  // Default source: attachments if any, otherwise body
  const [source, setSource] = useState<SourceKind>(
    uploadable.length > 0 ? 'attachments' : 'body',
  );
  const [destination, setDestination] = useState<Destination>('data_room');
  const [dealId, setDealId] = useState(initialDealId);
  const [dealName, setDealName] = useState(initialDealName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlighted, setHighlighted] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupInfo, setDupInfo] = useState<{ title: string; description: string } | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Capture window selection on mousedown of the card so the user's
  // highlight isn't lost when focus shifts. We only persist when the
  // user actually has selected meaningful text.
  const captureRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = () => {
      try {
        const sel = window.getSelection?.();
        const txt = (sel?.toString() || '').trim();
        if (txt.length >= 3) setHighlighted(txt);
      } catch {}
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  // If the matched deal arrives after mount, hydrate.
  useEffect(() => {
    if (!dealId && initialDealId) {
      setDealId(initialDealId);
      setDealName(initialDealName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDealId]);

  const dealOptions = useMemo(() => {
    return (deals || [])
      .filter((d: any) => !d.is_archived)
      .map((d: any) => ({ id: d.id, name: d.name as string, company: (d.company as string) || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deals]);

  const sourceDisabled = (s: SourceKind): boolean => {
    if (s === 'attachments') return uploadable.length === 0;
    if (s === 'body') return !thread.latestEmail.body_html && !thread.latestEmail.body_text && !thread.latestEmail.body_preview;
    if (s === 'highlighted') return highlighted.length < 3;
    return false;
  };

  const buildBodyText = (): string => {
    return (
      htmlToText(thread.latestEmail.body_html) ||
      thread.latestEmail.body_text ||
      thread.latestEmail.body_preview ||
      ''
    ).trim();
  };

  const saveTextAsNote = async (text: string): Promise<void> => {
    if (!user || !dealId) return;
    const note = `${buildContextHeader(thread)}${text}`;
    const { error } = await supabase
      .from('deal_status_notes')
      .insert({ deal_id: dealId, user_id: user.id, note });
    if (error) throw error;
  };

  const saveTextAsDataRoomFile = async (
    text: string,
    label: string,
    sourceKind: 'email_body' | 'email_highlight',
  ): Promise<string> => {
    if (!user || !dealId) return '';
    const fullText = `${buildContextHeader(thread)}${text}`;
    const blob = new Blob([fullText], { type: 'text/plain' });
    const safeSubject = (thread.subject || 'email').replace(/[^a-z0-9-_ ]/gi, '').slice(0, 60).trim() || 'email';
    const finalName = `${safeSubject} — ${label} ${timestampSuffix()}.txt`;
    const storageName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const filePath = `${user.id}/${dealId}/${storageName}`;
    const { error: upErr } = await supabase.storage
      .from('deal-attachments')
      .upload(filePath, blob, { contentType: 'text/plain' });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase.from('deal_attachments').insert({
      user_id: user.id,
      deal_id: dealId,
      name: finalName,
      file_path: filePath,
      content_type: 'text/plain',
      size_bytes: blob.size,
      category: 'other',
      source: sourceKind,
      source_email_id: messageId,
      source_thread_id: thread.threadId,
      source_subject: thread.subject,
      source_sender: `${thread.latestEmail.from_name} <${thread.latestEmail.from_email}>`,
    } as any);
    if (dbErr) {
      // 23505 = unique_violation on (deal_id, source_email_id, source) — treat as idempotent success
      if ((dbErr as any).code !== '23505') throw dbErr;
    }
    return finalName;
  };

  // ---------- Duplicate detection ----------
  const checkDuplicateAttachments = async (): Promise<string[]> => {
    if (!dealId) return [];
    const names = uploadable.map((a) => a.filename || '').filter(Boolean);
    if (!names.length) return [];
    const { data } = await supabase
      .from('deal_attachments')
      .select('name, source_email_id, source')
      .eq('deal_id', dealId)
      .eq('source_email_id', messageId);
    if (!data || !data.length) return [];
    // Match by stem of original filename (prior saves include a timestamp suffix)
    const stems = names.map((n) => {
      const dot = n.lastIndexOf('.');
      return (dot > 0 ? n.slice(0, dot) : n).toLowerCase().trim();
    });
    return data
      .filter((row: any) => {
        const lower = String(row.name || '').toLowerCase();
        return stems.some((s) => s && lower.includes(s));
      })
      .map((row: any) => row.name as string);
  };

  const checkDuplicateTextFile = async (): Promise<boolean> => {
    if (!dealId) return false;
    const sourceKind = source === 'highlighted' ? 'email_highlight' : 'email_body';
    const { data } = await supabase
      .from('deal_attachments')
      .select('id')
      .eq('deal_id', dealId)
      .eq('source_email_id', messageId)
      .eq('source', sourceKind)
      .limit(1);
    return !!(data && data.length);
  };

  const checkDuplicateNote = async (text: string): Promise<boolean> => {
    if (!dealId) return false;
    // Use a stable signature: subject + first 80 chars of payload
    const signature = `${thread.subject || ''}::${text.slice(0, 80)}`.toLowerCase().trim();
    if (!signature) return false;
    const { data } = await supabase
      .from('deal_status_notes')
      .select('note')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!data || !data.length) return false;
    return data.some((row: any) => {
      const n = String(row.note || '').toLowerCase();
      return n.includes((thread.subject || '').toLowerCase()) && n.includes(text.slice(0, 80).toLowerCase());
    });
  };
  // -----------------------------------------

  const performSave = async () => {
    if (!dealId) {
      toast.error('Pick a deal first');
      return;
    }
    if (sourceDisabled(source)) {
      toast.warning('Nothing to save from the selected source');
      return;
    }
    setSaving(true);
    setLastSaved(null);
    try {
      if (source === 'attachments') {
        if (destination === 'data_room') {
          const stamp = timestampSuffix();
          const result = await commitUpload({
            dealId,
            messageId,
            sourceEmail: {
              messageId,
              threadId: thread.threadId,
              subject: thread.subject,
              senderName: thread.latestEmail.from_name,
              senderEmail: thread.latestEmail.from_email,
            },
            plan: uploadable.map((a) => {
              const name = a.filename || 'attachment';
              const dot = name.lastIndexOf('.');
              const stem = dot > 0 ? name.slice(0, dot) : name;
              const ext = dot > 0 ? name.slice(dot) : '';
              return {
                attachment: a,
                desiredName: `${stem} ${stamp}${ext}`,
                category: 'materials' as const,
                include: true,
              };
            }),
          });
          if (result && result.uploaded > 0) {
            toast.success(`Saved to ${dealName} Data Room.`);
            setLastSaved({
              destination: 'data_room',
              dealId,
              dealName,
              label: result.uploaded === 1
                ? (uploadable[0]?.filename || 'attachment')
                : `${result.uploaded} files`,
              count: result.uploaded,
            });
          }
        } else {
          // attachments → notes (list filenames)
          const lines = uploadable.map((a) => `• ${a.filename || 'attachment'}`).join('\n');
          await saveTextAsNote(`Attachments referenced from email:\n${lines}`);
          toast.success(`Saved to ${dealName} Notes.`);
          setLastSaved({ destination: 'notes', dealId, dealName, label: 'Deal note' });
        }
      } else {
        const text = source === 'body' ? buildBodyText() : highlighted;
        if (!text) {
          toast.warning('No text to save');
          return;
        }
        if (destination === 'notes') {
          await saveTextAsNote(text);
          toast.success(`Saved to ${dealName} Notes.`);
          setLastSaved({ destination: 'notes', dealId, dealName, label: 'Deal note' });
        } else {
          const fileName = await saveTextAsDataRoomFile(
            text,
            source === 'body' ? 'email body' : 'highlight',
            source === 'body' ? 'email_body' : 'email_highlight',
          );
          toast.success(`Saved to ${dealName} Data Room.`);
          setLastSaved({ destination: 'data_room', dealId, dealName, label: fileName || 'File' });
        }
      }
    } catch (err: any) {
      console.error('[SaveToDeal] error:', err);
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!dealId) {
      toast.error('Pick a deal first');
      return;
    }
    if (sourceDisabled(source)) {
      toast.warning('Nothing to save from the selected source');
      return;
    }
    // Run duplicate detection before performing the save
    try {
      if (source === 'attachments' && destination === 'data_room') {
        const dups = await checkDuplicateAttachments();
        if (dups.length) {
          setDupInfo({
            title: 'Already saved to this deal',
            description: `${dups.length === 1 ? 'This attachment was' : `${dups.length} of these attachments were`} already saved from this email to ${dealName}'s Data Room (e.g. "${dups[0]}"). Save again anyway?`,
          });
          pendingSaveRef.current = performSave;
          setDupOpen(true);
          return;
        }
      } else if (source !== 'attachments' && destination === 'data_room') {
        const dup = await checkDuplicateTextFile();
        if (dup) {
          setDupInfo({
            title: 'Already saved to this deal',
            description: `Text from this email was already saved to ${dealName}'s Data Room. Save another copy?`,
          });
          pendingSaveRef.current = performSave;
          setDupOpen(true);
          return;
        }
      } else if (destination === 'notes') {
        const text = source === 'attachments'
          ? `Attachments referenced from email:\n${uploadable.map((a) => `• ${a.filename || 'attachment'}`).join('\n')}`
          : (source === 'body' ? buildBodyText() : highlighted);
        if (text) {
          const dup = await checkDuplicateNote(text);
          if (dup) {
            setDupInfo({
              title: 'Already saved to this deal',
              description: `A note from this email already exists on ${dealName}. Add another copy?`,
            });
            pendingSaveRef.current = performSave;
            setDupOpen(true);
            return;
          }
        }
      }
    } catch (err) {
      // Non-fatal: if detection fails, proceed with save
      console.warn('[SaveToDeal] dup check failed:', err);
    }
    await performSave();
  };

  const SourceChip = ({ kind, label, icon: Icon }: { kind: SourceKind; label: string; icon: any }) => {
    const disabled = sourceDisabled(kind);
    const active = source === kind;
    return (
      <button
        type="button"
        onClick={() => !disabled && setSource(kind)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 h-6 px-2 rounded-full shrink-0 whitespace-nowrap',
          'text-[11px] font-medium leading-none border transition-colors',
          active
            ? 'bg-primary/15 border-primary/30 text-primary'
            : 'bg-white/5 border-white/10 text-foreground/80 hover:bg-white/[0.09] hover:border-white/15',
          disabled && 'opacity-40 cursor-not-allowed',
        )}
        title={disabled ? `${label} (unavailable)` : label}
      >
        <Icon className="h-3 w-3" />
        {label}
        {kind === 'attachments' && uploadable.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{uploadable.length}</span>
        )}
      </button>
    );
  };

  const DestChip = ({ kind, label, icon: Icon }: { kind: Destination; label: string; icon: any }) => {
    const active = destination === kind;
    return (
      <button
        type="button"
        onClick={() => setDestination(kind)}
        className={cn(
          'inline-flex items-center gap-1 h-6 px-2 rounded-md shrink-0 whitespace-nowrap',
          'text-[11px] font-medium leading-none border transition-colors',
          active
            ? 'bg-primary/15 border-primary/30 text-primary'
            : 'bg-white/5 border-white/10 text-foreground/80 hover:bg-white/[0.09] hover:border-white/15',
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </button>
    );
  };

  const busy = saving || uploading;

  const lastSavedHref = lastSaved
    ? `/deal/${lastSaved.dealId}?tab=${lastSaved.destination === 'data_room' ? 'data-room' : 'deal-management'}`
    : null;

  return (
    <div ref={captureRef} className="rounded-md border border-white/[0.06] bg-card/40 p-2.5 space-y-2.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <Bookmark className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[11px] font-semibold tracking-wide text-foreground min-w-0 truncate">
          Save to deal
        </span>
      </div>

      {/* Source picker */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">What to save</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceChip kind="attachments" label="Attachments" icon={Paperclip} />
          <SourceChip kind="body" label="Email body" icon={Mail} />
          <SourceChip kind="highlighted" label="Highlighted" icon={Highlighter} />
        </div>
        {source === 'highlighted' && (
          <div className="text-[10px] text-muted-foreground/70 line-clamp-2">
            {highlighted ? `"${highlighted.slice(0, 140)}${highlighted.length > 140 ? '…' : ''}"` : 'Select text in the email to use this option.'}
          </div>
        )}
      </div>

      {/* Deal picker */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Deal</div>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full inline-flex items-center justify-between gap-2 h-7 px-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/[0.09] text-[11px]"
            >
              <span className="truncate">
                {dealName || (
                  <span className="text-muted-foreground">Pick a deal…</span>
                )}
                {matchedDealId && dealId === matchedDealId && (
                  <span className="ml-1.5 text-[10px] text-primary/80">(matched)</span>
                )}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search deals…" className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty>No deals found.</CommandEmpty>
                <CommandGroup>
                  {dealOptions.map((d) => (
                    <CommandItem
                      key={d.id}
                      value={`${d.name} ${d.company}`}
                      onSelect={() => {
                        setDealId(d.id);
                        setDealName(d.name);
                        setPickerOpen(false);
                      }}
                      className="text-[12px]"
                    >
                      <Check className={cn('h-3 w-3 mr-2', dealId === d.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{d.name}</span>
                        {d.company && (
                          <span className="text-[10px] text-muted-foreground truncate">{d.company}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Destination */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Save to</div>
        <div className="flex items-center gap-1.5">
          <DestChip kind="data_room" label="Data Room" icon={FolderOpen} />
          <DestChip kind="notes" label="Deal Notes" icon={FileText} />
        </div>
      </div>

      <div className="flex items-center justify-end pt-1">
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1.5"
          onClick={handleSave}
          disabled={busy || !dealId}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save to deal
        </Button>
      </div>

      {lastSaved && lastSavedHref && (
        <div className="flex items-start gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-1.5">
          <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-foreground/90 truncate">
              Saved <span className="font-medium">{lastSaved.label}</span> to{' '}
              <span className="font-medium">{lastSaved.dealName}</span>
            </div>
            <a
              href={lastSavedHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
            >
              Open {lastSaved.destination === 'data_room' ? 'Data Room' : 'Deal Notes'}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dupInfo?.title || 'Possible duplicate'}</AlertDialogTitle>
            <AlertDialogDescription>
              {dupInfo?.description || 'This item appears to already exist on the deal.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingSaveRef.current = null;
                setDupInfo(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const fn = pendingSaveRef.current;
                pendingSaveRef.current = null;
                setDupInfo(null);
                if (fn) await fn();
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
