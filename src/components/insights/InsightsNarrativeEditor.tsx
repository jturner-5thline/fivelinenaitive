import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2, List, ListOrdered, Quote,
  Link as LinkIcon, Image as ImageIcon, Paperclip,
  X, Loader2, FileText, ExternalLink, Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useReportAgendaQueue } from '@/hooks/useReportAgendaQueue';
import { MessageSquarePlus } from 'lucide-react';

export interface NarrativeAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;        // storage path inside `insights-attachments` bucket
  kind: 'image' | 'file';
  uploadedAt: string;  // ISO
}

interface Props {
  /** Current narrative HTML (or legacy plain text — autodetected). */
  value: string;
  /** Persisted attachments for this report period/tab. */
  attachments: NarrativeAttachment[];
  /** Storage key/scope for the current report (e.g. configKey). */
  scopeKey: string;
  /** Called when narrative HTML changes. Parent should debounce-save. */
  onChange: (html: string) => void;
  /** Called when attachments list changes (add/remove). Parent should persist. */
  onAttachmentsChange: (next: NarrativeAttachment[]) => void;
  /** Optional autosave indicator (true while save in flight). */
  isSaving?: boolean;
  /** Optional last-saved timestamp for footer hint. */
  savedAt?: number | null;
  /** Disable editing (e.g. read-only viewer). */
  readOnly?: boolean;
  /**
   * When true, the formatting toolbar stays hidden until the editor is
   * focused or the reader explicitly enters edit mode. Lets the narrative
   * render as document prose at rest.
   */
  chromeless?: boolean;
}

const BUCKET = 'insights-attachments';
const MAX_FILE = 15 * 1024 * 1024; // 15 MB

/**
 * Detect whether `value` is already HTML (rich-text) or legacy plain text from
 * the old textarea. Legacy plain text is migrated to <p>-wrapped HTML on first
 * render so TipTap shows it without losing line breaks.
 */
function toInitialHTML(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  // Heuristic: anything that contains an HTML tag we treat as HTML.
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) return value;
  // Plain text → preserve paragraphs and line breaks.
  return trimmed
    .split(/\n{2,}/)
    .map(para => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function fileKindOf(type: string): 'image' | 'file' {
  return type.startsWith('image/') ? 'image' : 'file';
}

function bytesLabel(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function getScrollContainer(start: HTMLElement | null, fallback: HTMLElement | null) {
  let node = start?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const isScrollable = /(auto|scroll|overlay)/.test(`${overflowY} ${overflowX}`)
      && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth);
    if (isScrollable) return node;
    node = node.parentElement;
  }
  return fallback;
}

/**
 * Rich-text narrative editor for Insights reports. Persists HTML via
 * `onChange` (parent debounces into the existing report save) and pushes
 * uploaded media into the company-scoped `insights-attachments` bucket.
 */
export function InsightsNarrativeEditor({
  value, attachments, scopeKey,
  onChange, onAttachmentsChange,
  isSaving, savedAt, readOnly, chromeless,
}: Props) {
  const { company } = useCompany();
  const { promote } = useReportAgendaQueue();
  const initialHTMLRef = useRef<string>(toInitialHTML(value));
  const lastEmittedRef = useRef<string>(initialHTMLRef.current);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selAction, setSelAction] = useState<
    { text: string; left: number; top: number; host: HTMLElement } | null
  >(null);
  // Signed-URL cache for attachments (refresh on mount + when list changes).
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'insights-narrative-image' } }),
      Placeholder.configure({ placeholder: 'Write the executive summary…' }),
    ],
    content: initialHTMLRef.current,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html === lastEmittedRef.current) return;
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'insights-narrative-prose focus:outline-none',
      },
    },
    onFocus: () => setFocused(true),
    onBlur: () => {
      // Keep the toolbar visible briefly so toolbar button clicks don't
      // re-blur away. Hide if focus didn't return into our container.
      setTimeout(() => {
        const root = containerRef.current;
        if (!root) return;
        if (!root.contains(document.activeElement)) setFocused(false);
      }, 100);
    },
  });

  // Sync incoming value updates (e.g. after period switch or hydration).
  useEffect(() => {
    if (!editor) return;
    const incoming = toInitialHTML(value);
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor]);

  // Refresh signed URLs for attachments.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!attachments.length) { setSignedUrls({}); return; }
      const paths = attachments.map(a => a.path);
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
      if (cancelled || error || !data) return;
      const next: Record<string, string> = {};
      data.forEach((d, i) => { if (d?.signedUrl) next[paths[i]] = d.signedUrl; });
      setSignedUrls(next);
    })();
    return () => { cancelled = true; };
  }, [attachments]);

  const uploadFile = useCallback(async (file: File, opts: { insertInline: boolean }) => {
    if (!company?.id) { toast.error('No company context'); return; }
    if (file.size > MAX_FILE) { toast.error(`${file.name} is too large (max 15 MB)`); return; }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'bin';
      const id = crypto.randomUUID();
      const path = `${company.id}/${scopeKey}/${id}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw error;
      const kind = fileKindOf(file.type);
      const att: NarrativeAttachment = {
        id, name: file.name, type: file.type || 'application/octet-stream',
        size: file.size, path, kind, uploadedAt: new Date().toISOString(),
      };
      onAttachmentsChange([...attachments, att]);

      if (opts.insertInline && kind === 'image' && editor) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
        if (data?.signedUrl) {
          editor.chain().focus().setImage({ src: data.signedUrl, alt: file.name } as any).run();
        }
      }
    } catch (err) {
      console.error('[insights-narrative] upload failed', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [company?.id, scopeKey, attachments, onAttachmentsChange, editor]);

  const removeAttachment = useCallback(async (att: NarrativeAttachment) => {
    try {
      await supabase.storage.from(BUCKET).remove([att.path]);
    } catch { /* ignore — still drop from list */ }
    onAttachmentsChange(attachments.filter(a => a.id !== att.id));
  }, [attachments, onAttachmentsChange]);

  const onPromptLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previous || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  // Track text selection inside the narrative editor and surface a small
  // "Comment → Queue" action above the selection.
  useEffect(() => {
    if (!editor || readOnly) return;
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setSelAction(null); return; }
      const text = sel.toString().trim();
      if (text.length < 2) { setSelAction(null); return; }
      const root = containerRef.current;
      if (!root) return;
      const anchorNode = sel.anchorNode;
      const anchorEl = (anchorNode && (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement)) as HTMLElement | null;
      if (!anchorEl || !root.contains(anchorEl) || !anchorEl.closest('.ProseMirror')) {
        setSelAction(null);
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        const rangeRect = range.getBoundingClientRect();
        if (!rangeRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
          setSelAction(null);
          return;
        }
        const host = getScrollContainer(anchorEl.closest('.ProseMirror') as HTMLElement | null, root);
        if (!host) {
          setSelAction(null);
          return;
        }
        if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const containerRect = host.getBoundingClientRect();
        const BTN_H = 26;
        const BTN_W = 96;
        const OFFSET = 6;
        let top = (rangeRect.top - containerRect.top) + host.scrollTop - BTN_H - OFFSET;
        if (top < host.scrollTop + 8) {
          top = (rangeRect.bottom - containerRect.top) + host.scrollTop + OFFSET;
        }
        const minTop = host.scrollTop + 8;
        const maxTop = Math.max(minTop, host.scrollTop + host.clientHeight - BTN_H - 8);
        top = clamp(top, minTop, maxTop);
        const minLeft = host.scrollLeft + 8;
        const maxLeft = Math.max(minLeft, host.scrollLeft + host.clientWidth - BTN_W - 8);
        const left = clamp(
          (rangeRect.left - containerRect.left) + host.scrollLeft,
          minLeft,
          maxLeft,
        );
        console.log('[InsightsNarrativeEditor] selection bubble position', {
          rangeRect: {
            top: rangeRect.top,
            left: rangeRect.left,
            right: rangeRect.right,
            bottom: rangeRect.bottom,
            width: rangeRect.width,
            height: rangeRect.height,
          },
          containerRect: {
            top: containerRect.top,
            left: containerRect.left,
            right: containerRect.right,
            bottom: containerRect.bottom,
            width: containerRect.width,
            height: containerRect.height,
          },
          scrollTop: host.scrollTop,
          scrollLeft: host.scrollLeft,
          top,
          left,
          strategy: 'scroll-container-absolute',
        });
        setSelAction({ text: text.slice(0, 400), left, top, host });
      } catch {
        setSelAction(null);
      }
    };
    editor.on('selectionUpdate', onSelChange);
    document.addEventListener('selectionchange', onSelChange);
    editor.on('blur', () => setTimeout(() => {
      const root = containerRef.current;
      if (root && !root.contains(document.activeElement)) setSelAction(null);
    }, 150));
    // Reposition on scroll/resize so the fixed bubble stays glued to
    // the selection rect instead of floating away.
    const reflow = () => onSelChange();
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    return () => {
      editor.off('selectionUpdate', onSelChange);
      document.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
    };
  }, [editor, readOnly]);

  if (!editor) {
    return (
      <div style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(160,200,255,0.45)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const TbBtn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
        'text-[rgba(220,232,248,0.75)] hover:bg-[rgba(120,170,255,0.12)]',
        active && 'bg-[rgba(120,170,255,0.18)] text-[rgb(220,232,248)]',
      )}
    >
      {children}
    </button>
  );

  const sep = <span aria-hidden style={{ width: 1, height: 16, background: 'rgba(120,170,255,0.18)', margin: '0 2px' }} />;

  const showToolbar = !readOnly && (!chromeless || focused);
  const isEmpty = editor.isEmpty;
  const selectionBubble = selAction && !readOnly && typeof document !== 'undefined'
    ? createPortal(
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          // Open the shared QirContextualComments composer (same UX as
          // Dashboard/Forecasts/Key Metrics) so the user can type a
          // comment before adding it to the Queue. We synthesise a
          // right-click on the ProseMirror surface at the current
          // selection — QirContextualComments' contextmenu handler
          // captures the live selection as the snippet.
          setSelAction(null);
          const sel = window.getSelection();
          let cx = 0, cy = 0;
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            cx = r.right; cy = r.bottom;
          }
          const pm = containerRef.current?.querySelector('.ProseMirror') as HTMLElement | null;
          const target = pm || containerRef.current;
          if (!target) return;
          target.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 2,
          }));
        }}
        style={{
          position: 'absolute', left: selAction.left, top: selAction.top,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: 'rgba(16,28,52,0.95)', color: '#cfe6ff',
          border: '1px solid rgba(80,150,220,0.45)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          cursor: 'pointer', zIndex: 1600, whiteSpace: 'nowrap',
        }}
        title="Add a comment on the selected text"
      >
        <MessageSquarePlus size={12} />
        Comment
      </button>,
      selAction.host,
    )
    : null;

  return (
    <div
      ref={containerRef}
      className="insights-narrative-editor"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      onFocus={() => setFocused(true)}
    >
      {showToolbar && (
        <div
          role="toolbar"
          aria-label="Narrative formatting"
          style={{
            display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(10,18,36,0.45)',
            border: '1px solid rgba(120,170,255,0.18)',
          }}
        >
          <TbBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></TbBtn>
          <TbBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></TbBtn>
          <TbBtn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></TbBtn>
          {sep}
          <TbBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} /></TbBtn>
          <TbBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></TbBtn>
          {sep}
          <TbBtn title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></TbBtn>
          <TbBtn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></TbBtn>
          <TbBtn title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></TbBtn>
          {sep}
          <TbBtn title="Add link" active={editor.isActive('link')} onClick={onPromptLink}><LinkIcon size={14} /></TbBtn>
          <TbBtn title="Insert image" onClick={() => imageInputRef.current?.click()}><ImageIcon size={14} /></TbBtn>
          <TbBtn title="Attach file" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /></TbBtn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'rgba(160,200,255,0.55)', paddingRight: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {uploading ? (<><Loader2 size={11} className="animate-spin" /> Uploading…</>)
              : isSaving ? (<><Loader2 size={11} className="animate-spin" /> Saving…</>)
              : savedAt ? (<><Check size={11} /> Saved</>)
              : null}
          </span>
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) await uploadFile(f, { insertInline: true });
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) await uploadFile(f, { insertInline: false });
        }}
      />

      <div
        style={{
          minHeight: 220,
          padding: chromeless ? '4px 2px' : 14,
          borderRadius: chromeless ? 0 : 8,
          background: chromeless ? 'transparent' : 'rgba(10,18,36,0.45)',
          border: chromeless ? '0' : '1px solid rgba(120,170,255,0.18)',
          color: '#dde8f8',
          fontSize: chromeless ? 14 : 13,
          lineHeight: 1.6,
          position: 'relative',
        }}
      >
        <EditorContent editor={editor} />
        {chromeless && !focused && isEmpty && !readOnly && (
          <div
            onClick={() => editor.chain().focus().run()}
            style={{ color: 'rgba(160,200,255,0.45)', fontStyle: 'italic', cursor: 'text', padding: '4px 0' }}
          >
            Click to write the executive summary…
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em',
            color: 'rgba(160,200,255,0.55)', marginTop: 4,
          }}>
            Attachments
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', padding: 0, margin: 0 }}>
            {attachments.map(att => {
              const url = signedUrls[att.path];
              return (
                <li key={att.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(10,18,36,0.4)',
                  border: '1px solid rgba(120,170,255,0.14)',
                  fontSize: 12,
                }}>
                  {att.kind === 'image' && url ? (
                    <img src={url} alt="" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 3 }} />
                  ) : (
                    <FileText size={14} style={{ color: 'rgba(160,200,255,0.6)', flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#dde8f8' }}>
                    {att.name}
                  </span>
                  <span style={{ color: 'rgba(160,200,255,0.5)' }}>{bytesLabel(att.size)}</span>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" title="Open"
                       style={{ color: 'rgba(160,200,255,0.7)', display: 'inline-flex' }}>
                      <ExternalLink size={13} />
                    </a>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={() => removeAttachment(att)} title="Remove"
                            style={{ color: 'rgba(255,140,140,0.75)', background: 'transparent', border: 0, padding: 0, display: 'inline-flex', cursor: 'pointer' }}>
                      <X size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <style>{`
        .insights-narrative-prose { outline: none; min-height: 180px; }
        .insights-narrative-prose p { margin: 0 0 8px; }
        .insights-narrative-prose p:last-child { margin-bottom: 0; }
        .insights-narrative-prose h1 { font-size: 18px; font-weight: 700; margin: 12px 0 6px; color: #f1f5ff; }
        .insights-narrative-prose h2 { font-size: 15px; font-weight: 700; margin: 10px 0 4px; color: #f1f5ff; }
        .insights-narrative-prose h3 { font-size: 13px; font-weight: 700; margin: 8px 0 4px; color: #f1f5ff; text-transform: uppercase; letter-spacing: .05em; }
        .insights-narrative-prose ul { list-style: disc; padding-left: 20px; margin: 4px 0 8px; }
        .insights-narrative-prose ol { list-style: decimal; padding-left: 20px; margin: 4px 0 8px; }
        .insights-narrative-prose li { margin: 2px 0; }
        .insights-narrative-prose a { color: rgb(120,170,255); text-decoration: underline; }
        .insights-narrative-prose blockquote { border-left: 3px solid rgba(120,170,255,0.4); padding: 2px 0 2px 10px; margin: 6px 0; color: rgba(220,232,248,0.85); font-style: italic; }
        .insights-narrative-prose img.insights-narrative-image, .insights-narrative-prose img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }
        .insights-narrative-prose strong { color: #f1f5ff; }
        .insights-narrative-prose p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: rgba(160,200,255,0.35);
          float: left;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
}