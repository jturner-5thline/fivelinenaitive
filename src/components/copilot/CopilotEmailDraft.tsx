import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Mail, Send, Clock, Save, Trash2, Copy, Check, AlertTriangle,
  Paperclip, X, FileText, ExternalLink, Undo2, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';

interface EmailDraftValue {
  to_name?: string;
  to_email?: string;
  cc?: string[] | string;
  bcc?: string[] | string;
  subject: string;
  body: string;
  deal_id?: string;
  deal_name?: string;
}

interface Recipient {
  email: string;
  name?: string;
}

interface VdrDoc {
  id: string;
  filename: string;
  file_size: number | null;
  file_path: string | null;
}

interface ContactHit {
  id: string;
  email: string;
  full_name: string | null;
}

const TONE_VARIANTS = [
  { label: 'Shorter', prompt: 'Rewrite the email draft above to be ~40% shorter, keeping the core ask intact.' },
  { label: 'More formal', prompt: 'Rewrite the email draft above in a more formal, professional tone.' },
  { label: 'Add urgency', prompt: 'Rewrite the email draft above to add appropriate urgency without being pushy.' },
  { label: 'Remove apology', prompt: 'Rewrite the email draft above and strip any apologetic phrasing.' },
  { label: 'Rewrite from scratch', prompt: 'Rewrite the email draft above from scratch with a fresh angle.' },
];

function parseRecipients(input: any): Recipient[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const out: Recipient[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      item.split(/[,;]+/).forEach((s) => {
        const t = s.trim();
        if (t) out.push({ email: t });
      });
    } else if (item && typeof item === 'object' && item.email) {
      out.push({ email: String(item.email), name: item.name });
    }
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ChipInput({
  label, value, onChange, placeholder, disabled,
}: {
  label: string;
  value: Recipient[];
  onChange: (r: Recipient[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = text.trim();
    if (q.length < 2) { setHits([]); setOpen(false); return; }
    debounceRef.current = window.setTimeout(async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id,email,full_name')
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .not('email', 'is', null)
        .limit(6);
      setHits((data || []) as ContactHit[]);
      setOpen((data || []).length > 0);
    }, 180);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [text]);

  const commit = (email: string, name?: string) => {
    const clean = email.trim();
    if (!clean) return;
    if (value.some((r) => r.email.toLowerCase() === clean.toLowerCase())) return;
    onChange([...value, { email: clean, name }]);
    setText(''); setHits([]); setOpen(false);
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 12px', borderBottom: '1px solid rgba(126,184,247,0.1)' }}>
      <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11, width: 36, paddingTop: 6, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', position: 'relative' }}>
        {value.map((r, i) => {
          const invalid = !EMAIL_RE.test(r.email);
          return (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 6px', borderRadius: 4, fontSize: 11,
              background: invalid ? 'rgba(239,68,68,0.12)' : 'rgba(126,184,247,0.12)',
              border: `1px solid ${invalid ? 'rgba(239,68,68,0.35)' : 'rgba(126,184,247,0.3)'}`,
              color: 'var(--foreground)',
            }}>
              {r.name && r.name !== r.email ? `${r.name} <${r.email}>` : r.email}
              {!disabled && (
                <button onClick={() => onChange(value.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={10} />
                </button>
              )}
            </span>
          );
        })}
        <input
          value={text}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && text.trim()) {
              e.preventDefault(); commit(text);
            } else if (e.key === 'Backspace' && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => { if (text.trim()) commit(text); setTimeout(() => setOpen(false), 150); }}
          style={{
            flex: 1, minWidth: 120, background: 'transparent', border: 0, outline: 'none',
            fontSize: 12, color: 'var(--foreground)', padding: '4px 0',
          }}
        />
        {open && hits.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))',
            borderRadius: 6, marginTop: 2, maxHeight: 200, overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {hits.map((h) => (
              <button key={h.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(h.email, h.full_name || undefined); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', background: 'transparent', border: 0, cursor: 'pointer',
                  fontSize: 12, color: 'var(--foreground)',
                }}>
                <div style={{ fontWeight: 500 }}>{h.full_name || h.email}</div>
                {h.full_name && <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>{h.email}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CopilotEmailDraft({ draft }: { draft: EmailDraftValue }) {
  // ===== Editable state seeded from AI draft =====
  const [to, setTo] = useState<Recipient[]>(() => {
    if (draft.to_email) return [{ email: draft.to_email, name: draft.to_name }];
    return [];
  });
  const [cc, setCc] = useState<Recipient[]>(() => parseRecipients(draft.cc));
  const [bcc, setBcc] = useState<Recipient[]>(() => parseRecipients(draft.bcc));
  const [showCcBcc, setShowCcBcc] = useState(parseRecipients(draft.cc).length > 0 || parseRecipients(draft.bcc).length > 0);
  const [subject, setSubject] = useState(draft.subject || '');
  const [body, setBody] = useState(draft.body || '');
  const [attachments, setAttachments] = useState<Array<{ filename: string; content: string; content_type: string; size: number }>>([]);

  // ===== UX state =====
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<null | 'send' | 'draft' | 'schedule'>(null);
  const [sent, setSent] = useState<{ messageId: string; at: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d;
  });
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [vdrDocs, setVdrDocs] = useState<VdrDoc[] | null>(null);
  const [vdrOpen, setVdrOpen] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const [undoRemaining, setUndoRemaining] = useState(0);

  // ===== Pre-fill recipient from primary deal contact if AI didn't supply one =====
  useEffect(() => {
    if (to.length > 0 || !draft.deal_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('contact_deals')
        .select('contacts!inner(id,email,full_name)')
        .eq('deal_id', draft.deal_id)
        .limit(5);
      if (cancelled || !data) return;
      const first = (data as any[]).find((r) => r.contacts?.email);
      if (first) {
        setTo([{ email: first.contacts.email, name: first.contacts.full_name || undefined }]);
      }
    })();
    return () => { cancelled = true; };
  }, [draft.deal_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Term-sheet quick-action: fetch deal VDR docs lazily =====
  const loadVdr = async () => {
    if (!draft.deal_id || vdrDocs !== null) { setVdrOpen(true); return; }
    const { data } = await supabase
      .from('vdr_documents')
      .select('id,filename,file_size,file_path')
      .eq('deal_id', draft.deal_id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(40);
    setVdrDocs((data || []) as VdrDoc[]);
    setVdrOpen(true);
  };

  const attachVdrDoc = async (doc: VdrDoc) => {
    if (!doc.file_path) { toast.error('File path missing'); return; }
    try {
      const { data, error } = await supabase.storage.from('vdr-documents').download(doc.file_path);
      if (error || !data) throw error || new Error('Download failed');
      const buf = new Uint8Array(await data.arrayBuffer());
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
      const content = btoa(bin);
      setAttachments((a) => [...a, {
        filename: doc.filename, content, content_type: data.type || 'application/octet-stream', size: buf.length,
      }]);
      toast.success(`Attached ${doc.filename}`);
      setVdrOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to attach');
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('File exceeds 20MB'); return; }
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
    setAttachments((a) => [...a, {
      filename: file.name, content: btoa(bin), content_type: file.type || 'application/octet-stream', size: file.size,
    }]);
    e.target.value = '';
  };

  // ===== Validation =====
  const recipientErrors = useMemo(() => {
    const all = [...to, ...cc, ...bcc].map((r) => r.email);
    return all.filter((e) => !EMAIL_RE.test(e));
  }, [to, cc, bcc]);
  const noRecipient = to.length === 0;
  const canSend = !noRecipient && recipientErrors.length === 0 && subject.trim().length > 0 && !busy && !sent;

  // ===== Activity log =====
  const logActivity = async (action_type: string, payload: Record<string, any>) => {
    if (!draft.deal_id) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from('deal_activity').insert({
      deal_id: draft.deal_id, user_id: u.user?.id, source: 'ai_assistant',
      action_type, before: {}, after: payload,
    });
  };

  // ===== Send via Gmail =====
  const doSend = async () => {
    setConfirmOpen(false);
    setBusy('send');
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: to.map((r) => r.email), cc: cc.map((r) => r.email), bcc: bcc.map((r) => r.email),
          subject, body_html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          body, attachments,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Send failed');
      const messageId = data.message_id;
      setSent({ messageId, at: Date.now() });
      await logActivity('email_sent', {
        subject, to: to.map((r) => r.email), cc: cc.map((r) => r.email),
        gmail_message_id: messageId,
      });
      window.dispatchEvent(new CustomEvent('deal.updated', { detail: { deal_id: draft.deal_id, action: 'email_sent' } }));

      // Undo window: 10s countdown
      setUndoRemaining(10);
      undoTimerRef.current = window.setInterval(() => {
        setUndoRemaining((r) => {
          if (r <= 1) {
            if (undoTimerRef.current) { window.clearInterval(undoTimerRef.current); undoTimerRef.current = null; }
            return 0;
          }
          return r - 1;
        });
      }, 1000) as unknown as number;

      toast.success(`Email sent to ${to[0].email}${to.length > 1 ? ` +${to.length - 1}` : ''}`, {
        description: 'You can open the sent message in Gmail.',
        duration: 10000,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setBusy(null);
    }
  };

  // ===== Save as Gmail draft =====
  const doSaveDraft = async () => {
    if (noRecipient || !subject.trim()) { toast.error('To and subject required'); return; }
    setBusy('draft');
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'save_draft',
          to: to.map((r) => r.email), cc: cc.map((r) => r.email), bcc: bcc.map((r) => r.email),
          subject, body_html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          body, attachments,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Failed');
      await logActivity('email_drafted', { subject, to: to.map((r) => r.email), draft_id: data.draft_id });
      toast.success('Draft saved to Gmail');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save draft');
    } finally {
      setBusy(null);
    }
  };

  // ===== Schedule send =====
  const doSchedule = async () => {
    if (!scheduleDate) return;
    const [hh, mm] = scheduleTime.split(':').map(Number);
    const when = new Date(scheduleDate);
    when.setHours(hh || 9, mm || 0, 0, 0);
    if (when.getTime() <= Date.now()) { toast.error('Pick a future time'); return; }
    setBusy('schedule');
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('scheduled_emails').insert({
        user_id: u.user?.id,
        to_recipients: to.map((r) => r.email) as any,
        cc_recipients: cc.map((r) => r.email) as any,
        bcc_recipients: bcc.map((r) => r.email) as any,
        subject,
        body_html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br/>')}</p>`,
        body_text: body,
        scheduled_for: when.toISOString(),
        metadata: { source: 'copilot', deal_id: draft.deal_id },
      });
      if (error) throw error;
      await logActivity('email_scheduled', { subject, to: to.map((r) => r.email), scheduled_for: when.toISOString() });
      toast.success(`Scheduled for ${when.toLocaleString()}`);
      setScheduleOpen(false);
      setSent({ messageId: 'scheduled', at: Date.now() });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to schedule');
    } finally {
      setBusy(null);
    }
  };

  // ===== Undo (only meaningful while window is open) =====
  const cancelUndoTimer = () => {
    if (undoTimerRef.current) { window.clearInterval(undoTimerRef.current); undoTimerRef.current = null; }
    setUndoRemaining(0);
  };
  useEffect(() => () => cancelUndoTimer(), []);

  const onUndo = async () => {
    if (!sent || sent.messageId === 'scheduled') return;
    cancelUndoTimer();
    try {
      // Best-effort: move sent message to trash via Nylas
      await supabase.functions.invoke('gmail-messages', {
        body: { action: 'trash', message_id: sent.messageId },
      });
      await logActivity('email_undone', { gmail_message_id: sent.messageId });
      toast.success('Sent message moved to Trash');
      setSent(null);
    } catch (e: any) {
      toast.error('Undo failed — the email may have left the server');
    }
  };

  const onVariantChip = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('naitive:copilot-prompt', { detail: { prompt } }));
  };

  const handleCopy = async () => {
    const plain = `To: ${to.map((r) => r.email).join(', ')}\nSubject: ${subject}\n\n${body.replace(/<[^>]*>/g, '')}`;
    await navigator.clipboard.writeText(plain);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  // ============ Render ============
  return (
    <div style={{
      background: 'rgba(126,184,247,0.06)',
      border: '1px solid rgba(126,184,247,0.22)',
      borderRadius: 8, overflow: 'hidden', marginTop: 8,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid rgba(126,184,247,0.15)',
        background: 'rgba(126,184,247,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Mail size={14} style={{ color: 'hsl(var(--primary))' }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>Email Draft — awaiting your approval</span>
        </div>
        <button onClick={handleCopy} title="Copy to clipboard" style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
          borderRadius: 4, background: 'transparent', border: '1px solid var(--glass-border)',
          color: 'hsl(var(--muted-foreground))', fontSize: 10, cursor: 'pointer',
        }}>
          {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* No-recipient warning */}
      {noRecipient && (
        <div style={{
          padding: '6px 12px', background: 'rgba(234,179,8,0.1)',
          borderBottom: '1px solid rgba(234,179,8,0.25)',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgb(234,179,8)',
        }}>
          <AlertTriangle size={12} />
          No recipient on file — add one before sending.
        </div>
      )}
      {recipientErrors.length > 0 && (
        <div style={{
          padding: '6px 12px', background: 'rgba(239,68,68,0.1)',
          borderBottom: '1px solid rgba(239,68,68,0.25)',
          fontSize: 11, color: 'rgb(239,68,68)',
        }}>
          Invalid address: {recipientErrors.join(', ')}
        </div>
      )}

      {/* Recipients */}
      <ChipInput label="To" value={to} onChange={setTo} placeholder="name@example.com" disabled={!!sent} />
      {!showCcBcc ? (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid rgba(126,184,247,0.1)' }}>
          <button onClick={() => setShowCcBcc(true)} style={{
            background: 'transparent', border: 0, fontSize: 10,
            color: 'hsl(var(--muted-foreground))', cursor: 'pointer', padding: 0,
          }}>+ Cc / Bcc</button>
        </div>
      ) : (
        <>
          <ChipInput label="Cc" value={cc} onChange={setCc} disabled={!!sent} />
          <ChipInput label="Bcc" value={bcc} onChange={setBcc} disabled={!!sent} />
        </>
      )}

      {/* Subject */}
      <div style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid rgba(126,184,247,0.1)', alignItems: 'center' }}>
        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11, width: 36 }}>Subj</span>
        <input
          value={subject}
          disabled={!!sent}
          onChange={(e) => setSubject(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            fontSize: 12, fontWeight: 500, color: 'var(--foreground)',
          }}
        />
      </div>

      {/* Body — editable plain/HTML toggle via contentEditable */}
      <div
        contentEditable={!sent}
        suppressContentEditableWarning
        onInput={(e) => setBody((e.target as HTMLDivElement).innerHTML)}
        style={{
          padding: '8px 12px', fontSize: 13, lineHeight: 1.6,
          color: 'var(--foreground)', minHeight: 100, maxHeight: 240, overflowY: 'auto',
          outline: 'none', cursor: sent ? 'default' : 'text',
        }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(
            body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br/>')}</p>`,
            { USE_PROFILES: { html: true } },
          ),
        }}
      />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(126,184,247,0.1)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attachments.map((a, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 6px', borderRadius: 4, fontSize: 10,
              background: 'rgba(126,184,247,0.1)', border: '1px solid rgba(126,184,247,0.25)',
            }}>
              <Paperclip size={10} /> {a.filename} <span style={{ color: 'hsl(var(--muted-foreground))' }}>({(a.size / 1024).toFixed(0)}KB)</span>
              {!sent && (
                <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Attachment quick actions */}
      {!sent && (
        <div style={{
          padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
          borderTop: '1px solid rgba(126,184,247,0.1)',
        }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
            color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
          }}>
            <Paperclip size={11} /> Attach file
            <input type="file" hidden onChange={onPickFile} />
          </label>
          {draft.deal_id && (
            <Popover open={vdrOpen} onOpenChange={(o) => o ? loadVdr() : setVdrOpen(false)}>
              <PopoverTrigger asChild>
                <button style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
                  color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
                  background: 'transparent', border: 0, padding: 0,
                }}>
                  <FileText size={11} /> Attach from deal VDR
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-1" align="start">
                {vdrDocs === null ? (
                  <div style={{ padding: 8, fontSize: 11 }}>Loading…</div>
                ) : vdrDocs.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>No documents in deal VDR.</div>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {vdrDocs.map((d) => (
                      <button key={d.id} onClick={() => attachVdrDoc(d)} style={{
                        display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                        padding: '6px 8px', background: 'transparent', border: 0, cursor: 'pointer',
                        fontSize: 12, borderRadius: 4,
                      }}>
                        <FileText size={11} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
                        {d.file_size && <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>{(d.file_size / 1024).toFixed(0)}KB</span>}
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {/* Sent / scheduled state */}
      {sent && (
        <div style={{
          padding: '8px 12px', background: 'rgba(34,197,94,0.08)',
          borderTop: '1px solid rgba(34,197,94,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: 'rgb(34,197,94)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={12} />
            {sent.messageId === 'scheduled' ? 'Scheduled' : `Sent · ${Math.max(0, Math.round((Date.now() - sent.at) / 1000))}s ago`}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {sent.messageId !== 'scheduled' && undoRemaining > 0 && (
              <button onClick={onUndo} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: 'rgb(239,68,68)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Undo2 size={10} /> Undo ({undoRemaining}s)
              </button>
            )}
            {draft.deal_id && (
              <a href={`/deals/${draft.deal_id}?tab=activity`} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: 'transparent', border: '1px solid var(--glass-border)',
                color: 'hsl(var(--muted-foreground))', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <ExternalLink size={10} /> Activity
              </a>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!sent && (
        <div style={{
          padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center',
          borderTop: '1px solid rgba(126,184,247,0.15)', flexWrap: 'wrap',
          background: 'rgba(126,184,247,0.03)',
        }}>
          <button
            disabled={!canSend}
            onClick={() => setConfirmOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 6,
              background: canSend ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
              color: canSend ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
              border: 0, fontSize: 12, fontWeight: 500,
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}>
            <Send size={12} /> {busy === 'send' ? 'Sending…' : 'Send via Gmail'}
          </button>

          <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <PopoverTrigger asChild>
              <button disabled={noRecipient || !subject.trim() || !!busy} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', borderRadius: 6,
                background: 'transparent', border: '1px solid var(--glass-border)',
                color: 'var(--foreground)', fontSize: 11, cursor: 'pointer',
              }}>
                <Clock size={11} /> Schedule send…
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <Calendar
                mode="single"
                selected={scheduleDate}
                onSelect={setScheduleDate}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className="p-0 pointer-events-auto"
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                <Clock size={12} />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  style={{
                    flex: 1, padding: '4px 6px', fontSize: 12,
                    background: 'transparent', border: '1px solid var(--glass-border)',
                    borderRadius: 4, color: 'var(--foreground)',
                  }}
                />
                <Button size="sm" onClick={doSchedule} disabled={busy === 'schedule'}>
                  {busy === 'schedule' ? 'Scheduling…' : 'Schedule'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <button onClick={doSaveDraft} disabled={noRecipient || !subject.trim() || !!busy} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--glass-border)',
            color: 'var(--foreground)', fontSize: 11, cursor: 'pointer',
          }}>
            <Save size={11} /> {busy === 'draft' ? 'Saving…' : 'Save as draft in Gmail'}
          </button>

          <button onClick={() => {
            setSubject(''); setBody(''); setTo([]); setCc([]); setBcc([]); setAttachments([]);
            toast('Draft discarded');
          }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto',
            padding: '6px 10px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--glass-border)',
            color: 'hsl(var(--muted-foreground))', fontSize: 11, cursor: 'pointer',
          }}>
            <Trash2 size={11} /> Discard
          </button>
        </div>
      )}

      {/* Tone variant chips */}
      {!sent && (
        <div style={{
          padding: '6px 12px', display: 'flex', gap: 4, flexWrap: 'wrap',
          borderTop: '1px solid rgba(126,184,247,0.1)',
        }}>
          {TONE_VARIANTS.map((v) => (
            <button key={v.label} onClick={() => onVariantChip(v.prompt)} style={{
              padding: '3px 8px', borderRadius: 999, fontSize: 10,
              background: 'rgba(126,184,247,0.08)', border: '1px solid rgba(126,184,247,0.2)',
              color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
            }}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Confirmation modal */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this email now?</AlertDialogTitle>
            <AlertDialogDescription>
              Recipients:&nbsp;
              <strong>{to.map((r) => r.name || r.email).join(', ')}</strong>
              {cc.length > 0 && <> · Cc <strong>{cc.map((r) => r.email).join(', ')}</strong></>}
              <br />Subject: <strong>{subject}</strong>
              <br /><br />Once sent, you'll have a 10-second undo window before the message is fully delivered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSend}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}