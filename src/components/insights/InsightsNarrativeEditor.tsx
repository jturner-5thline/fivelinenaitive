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
import { BarChart3 } from 'lucide-react';
import { UploadCloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MessageSquarePlus } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { KpiEmbedNode } from '@/components/insights/narrative/KpiEmbedNode';
import {
  computeSelectionBubblePosition,
  getSelectionAnchorRect,
  getTrueScrollContainer,
} from '@/components/insights/comments/selectionBubblePosition';

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
  /** When set, an "Add KPI" button appears in the toolbar and calls this handler. */
  onRequestInsertKpi?: () => void;
  /** Called once the tiptap editor is ready so the parent can insert nodes. */
  onEditorReady?: (editor: Editor) => void;
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

/**
 * Toolbar button. Hoisted at module scope so it doesn't get a new component
 * identity on every parent render — otherwise React unmounts and remounts
 * every toolbar button on each keystroke, which drops the pending
 * `mousedown → click` sequence and made bold/italic/underline appear to
 * silently no-op mid-typing.
 */
const TbBtn = ({
  onClick,
  onPointerDown,
  active,
  title,
  children,
  preserveFocus = true,
}: {
  onClick: () => void;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  preserveFocus?: boolean;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onPointerDown={onPointerDown}
    onMouseDown={preserveFocus ? e => e.preventDefault() : undefined}
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

/**
 * Rich-text narrative editor for Insights reports. Persists HTML via
 * `onChange` (parent debounces into the existing report save) and pushes
 * uploaded media into the company-scoped `insights-attachments` bucket.
 */
export function InsightsNarrativeEditor({
  value, attachments, scopeKey,
  onChange, onAttachmentsChange,
  isSaving, savedAt, readOnly, chromeless,
  onRequestInsertKpi, onEditorReady,
}: Props) {
  const { company } = useCompany();
  const initialHTMLRef = useRef<string>(toInitialHTML(value));
  const lastEmittedRef = useRef<string>(initialHTMLRef.current);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileModeRef = useRef<'file' | 'image' | 'auto'>('file');
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState(false);
  // Attach dialog (paperclip): keep the file input mounted persistently and
  // trigger it only from an immediate user click (toolbar or Browse files).
  const [attachDialog, setAttachDialog] = useState<null | { mode: 'file' | 'image' }>(null);
  const [dragOver, setDragOver] = useState(false);
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
      KpiEmbedNode,
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

  // Expose editor upward so the parent can call `insertContent` for KPI embeds.
  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Sync incoming value updates (e.g. after period switch or hydration).
  //
  // IMPORTANT: while the user is actively typing (editor focused), we must
  // never re-apply the parent's `value` prop. Autosave roundtrips can push
  // a stale narrative back into `value` after the user has typed more
  // characters; calling `setContent` then would drop those keystrokes,
  // jump the cursor, and scroll the page. We only resync when the editor
  // is unfocused (period switch, hydration, external edits).
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const incoming = toInitialHTML(value);
    if (incoming === lastEmittedRef.current) return;
    // Also skip if the current editor content already matches incoming —
    // avoids a redundant setContent that would still reset the cursor.
    if (incoming === editor.getHTML()) {
      lastEmittedRef.current = incoming;
      return;
    }
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

  const openAttachDialog = useCallback(() => {
    setDragOver(false);
    setFocused(true);
    setAttachDialog({ mode: 'file' });
  }, []);

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
        const { rect: rangeRect, source: rectSource, rectCount } = getSelectionAnchorRect(range, anchorEl);
        if (!rangeRect) {
          setSelAction(null);
          return;
        }
        const focusNode = range.endContainer;
        const focusEl = (focusNode && (focusNode.nodeType === 1 ? focusNode : focusNode.parentElement)) as HTMLElement | null;
        const host = getTrueScrollContainer(focusEl || anchorEl, root);
        if (!host) {
          setSelAction(null);
          return;
        }
        if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const { top, left, containerRect } = computeSelectionBubblePosition({
          host,
          rangeRect,
          bubbleHeight: 26,
          bubbleWidth: 96,
          offset: 8,
        });
        console.log('[InsightsNarrativeEditor] selection bubble position', {
          host: {
            tagName: host.tagName,
            className: host.className,
            clientHeight: host.clientHeight,
            scrollHeight: host.scrollHeight,
            clientWidth: host.clientWidth,
            scrollWidth: host.scrollWidth,
            offsetParentTag: (host.offsetParent as HTMLElement | null)?.tagName ?? null,
            offsetParentClassName: (host.offsetParent as HTMLElement | null)?.className ?? null,
          },
          rangeRect: { top: rangeRect.top, left: rangeRect.left, right: rangeRect.right, bottom: rangeRect.bottom, width: rangeRect.width, height: rangeRect.height },
          containerRect: { top: containerRect.top, left: containerRect.left, right: containerRect.right, bottom: containerRect.bottom, width: containerRect.width, height: containerRect.height },
          scrollTop: host.scrollTop,
          scrollLeft: host.scrollLeft,
          top,
          left,
          rectSource,
          rectCount,
          strategy: 'true-scroll-container-absolute',
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

  // Toolbar button component is hoisted at module scope (see TbBtn below the
  // component). Defining it inline would create a new component type on every
  // render, which unmounts and remounts every button on each keystroke — that
  // in turn drops the pending `mousedown → click` sequence when the toolbar
  // is used to toggle formatting mid-typing, and made bold/italic/underline
  // silently no-op for users.

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
      {showToolbar && typeof document !== 'undefined' && createPortal(
        <div
          role="toolbar"
          aria-label="Narrative formatting"
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'fixed',
            top: `calc(var(--app-top-bar-height, 0px) + 12px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1400,
            display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(10,18,36,0.92)',
            border: '1px solid rgba(120,170,255,0.28)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            maxWidth: 'min(96vw, 720px)',
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
          <TbBtn title="Insert image" preserveFocus={false} onClick={() => {
            const input = fileInputRef.current;
            if (!input) return;
            pendingFileModeRef.current = 'image';
            input.accept = 'image/*';
            input.click();
          }}><ImageIcon size={14} /></TbBtn>
          <TbBtn
            title="Attach file"
            preserveFocus={false}
            onPointerDown={(e) => {
              e.stopPropagation();
              openAttachDialog();
            }}
            onClick={openAttachDialog}
          ><Paperclip size={14} /></TbBtn>
          {onRequestInsertKpi && (
            <>
              {sep}
              <button
                type="button"
                title="Insert widget / KPI"
                aria-label="Insert widget or KPI"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onRequestInsertKpi()}
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded-md transition-colors',
                  'text-[rgba(220,232,248,0.85)] hover:bg-[rgba(120,170,255,0.16)]',
                  'text-[11px] font-semibold uppercase tracking-wide',
                )}
              >
                <BarChart3 size={13} />
                Add KPI
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'rgba(160,200,255,0.55)', paddingRight: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {uploading ? (<><Loader2 size={11} className="animate-spin" /> Uploading…</>)
              : isSaving ? (<><Loader2 size={11} className="animate-spin" /> Saving…</>)
              : savedAt ? (<><Check size={11} /> Saved</>)
              : null}
          </span>
        </div>,
        document.body,
      )}

      {/* Persistent file picker: always mounted and never display:none. */}
      <input
        ref={fileInputRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
          overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
        }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          e.currentTarget.accept = '';
          if (!f) return;
          const mode = pendingFileModeRef.current;
          pendingFileModeRef.current = 'file';
          setAttachDialog(null);
          await uploadFile(f, { insertInline: mode === 'image' || (mode === 'auto' && f.type.startsWith('image/')) });
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
        .insights-narrative-prose strong,
        .insights-narrative-prose b,
        .insights-narrative-prose .ProseMirror strong,
        .ProseMirror.insights-narrative-prose strong,
        .insights-narrative-editor strong { font-weight: 700 !important; color: #f1f5ff; }
        .insights-narrative-prose em,
        .insights-narrative-prose i,
        .insights-narrative-editor em,
        .insights-narrative-editor i { font-style: italic !important; }
        .insights-narrative-prose u,
        .insights-narrative-editor u { text-decoration: underline !important; }
        .insights-narrative-prose s,
        .insights-narrative-prose del,
        .insights-narrative-editor s,
        .insights-narrative-editor del { text-decoration: line-through !important; }
        .insights-narrative-prose code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: rgba(120,170,255,0.12); padding: 1px 4px; border-radius: 4px; }
        .insights-narrative-prose p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: rgba(160,200,255,0.35);
          float: left;
          pointer-events: none;
          height: 0;
        }
      `}</style>
      {attachDialog && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attach a file"
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(4,10,22,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 'min(92vw, 460px)',
              background: 'rgb(12,22,42)',
              border: '1px solid rgba(120,170,255,0.28)',
              borderRadius: 12,
              padding: 18,
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
              color: '#dde8f8',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Attach a file</div>
              <button
                type="button"
                onClick={() => setAttachDialog(null)}
                aria-label="Close"
                style={{ background: 'transparent', border: 0, color: 'rgba(220,232,248,0.7)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
              >
                <X size={16} />
              </button>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (!f) return;
                setAttachDialog(null);
                await uploadFile(f, { insertInline: false });
              }}
              style={{
                border: `2px dashed ${dragOver ? 'rgba(120,170,255,0.7)' : 'rgba(120,170,255,0.3)'}`,
                background: dragOver ? 'rgba(120,170,255,0.08)' : 'rgba(10,18,36,0.5)',
                borderRadius: 10,
                padding: '28px 16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                textAlign: 'center', transition: 'background 120ms',
              }}
            >
              <UploadCloud size={26} style={{ color: 'rgba(160,200,255,0.75)' }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Drag &amp; drop a file here</div>
              <button
                type="button"
                onClick={() => {
                  const input = fileInputRef.current;
                  if (!input) return;
                  pendingFileModeRef.current = 'file';
                  input.accept = '';
                  input.click();
                }}
                style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: 'rgba(120,170,255,0.16)', color: 'rgb(210,230,255)',
                  border: '1px solid rgba(120,170,255,0.35)', cursor: 'pointer',
                }}
              >
                Browse files
              </button>
              <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.45)', marginTop: 4 }}>
                Max 15 MB. Files attach below the narrative.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setAttachDialog(null)}
                style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'transparent', color: 'rgba(220,232,248,0.8)',
                  border: '1px solid rgba(120,170,255,0.25)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
            {uploading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'rgba(160,200,255,0.75)' }}>
                <Loader2 size={12} className="animate-spin" /> Uploading…
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}