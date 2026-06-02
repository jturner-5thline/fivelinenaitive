import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { FontSize } from '@tiptap/extension-font-size';
import Heading from '@tiptap/extension-heading';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useInsightsTimeframe, reportingPeriodHelpers } from '@/contexts/InsightsTimeframeContext';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, ListChecks, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, Eraser, Heading1, Heading2, Heading3, Check, Loader2, Copy,
} from 'lucide-react';

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
];

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px'];

export const SEED_SECTIONS = ['Presentation', 'Looking Forward', 'New Items', 'Prep'] as const;
export const SEED_SUBTITLE = '(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max';

const headingNode = (text: string) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const subtitleNode = () => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    marks: [
      { type: 'italic' },
      { type: 'textStyle', attrs: { fontSize: '13px', color: 'rgba(200,225,255,0.55)' } },
    ],
    text: SEED_SUBTITLE,
  }],
});

// Only the Presentation section carries the subtitle; the other sections
// render as a heading followed by an empty body.
const SEED_CONTENT = {
  type: 'doc',
  content: SEED_SECTIONS.flatMap((s) =>
    s === 'Presentation'
      ? [headingNode(s), subtitleNode(), { type: 'paragraph' }]
      : [headingNode(s), { type: 'paragraph' }],
  ),
};

// Zod schema mirroring the DB CHECK constraint on insights_agenda.
const monthKeyRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const quarterKeyRe = /^\d{4}-Q[1-4]$/;
export const agendaPersistSchema = z
  .object({
    period_type: z.enum(['month', 'quarter']),
    period_key: z.string(),
    content_json: z.record(z.any()),
  })
  .refine(
    (v) =>
      (v.period_type === 'month' && monthKeyRe.test(v.period_key)) ||
      (v.period_type === 'quarter' && quarterKeyRe.test(v.period_key)),
    { message: 'Invalid reporting period', path: ['period_key'] },
  );

/**
 * Returns true when the editor JSON doc matches the default 4-heading seed
 * (i.e. user hasn't added any real content yet).
 */
export function isSeedContent(doc: any): boolean {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return true;
  const headings = doc.content
    .filter((n: any) => n?.type === 'heading')
    .map((n: any) => n?.content?.[0]?.text ?? '');
  const required = [...SEED_SECTIONS];
  const headingsMatch =
    headings.length === required.length &&
    required.every((h, i) => headings[i] === h);
  if (!headingsMatch) return false;
  // Non-heading nodes must be either empty paragraphs or exactly the
  // auto-seeded subtitle paragraph. Anything else means the user added content.
  const hasUserContent = doc.content.some((n: any) => {
    if (n?.type === 'heading') return false;
    if (n?.type !== 'paragraph') return true; // lists, tasks, etc.
    if (!Array.isArray(n.content) || n.content.length === 0) return false;
    // Allow a single text node equal to the seed subtitle.
    if (n.content.length === 1 && n.content[0]?.type === 'text' && n.content[0]?.text === SEED_SUBTITLE) {
      return false;
    }
    return true;
  });
  return !hasUserContent;
}

/** Compute the previous period token for a given granularity. */
export function previousPeriodKey(type: 'month' | 'quarter', key: string): string | null {
  if (type === 'month') {
    const m = monthKeyRe.exec(key);
    if (!m) return null;
    const y = parseInt(key.slice(0, 4), 10);
    const mo = parseInt(key.slice(5, 7), 10);
    const d = new Date(y, mo - 2, 1); // JS handles year rollover
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const m = quarterKeyRe.exec(key);
  if (!m) return null;
  let y = parseInt(key.slice(0, 4), 10);
  let q = parseInt(key.slice(6, 7), 10) - 1;
  if (q < 1) { q = 4; y -= 1; }
  return `${y}-Q${q}`;
}

function formatPeriodLabel(type: 'month' | 'quarter', key: string): string {
  if (type === 'month') {
    const [y, mo] = key.split('-').map(Number);
    const d = new Date(y, mo - 1, 1);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const [y, q] = key.split('-Q');
  return `Q${q} ${y}`;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function ToolbarBtn({
  onClick, active, disabled, title, children,
}: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: 30, minWidth: 30, padding: '0 6px', borderRadius: 6,
        border: '0.5px solid rgba(80,140,255,0.18)',
        background: active ? 'linear-gradient(180deg, #9bdcff, #4db8ff)' : 'rgba(16,28,52,0.55)',
        color: active ? '#0a2540' : 'rgba(200,225,255,0.85)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', gap: 4, padding: '0 8px',
      borderRight: '1px solid rgba(80,140,255,0.12)',
    }}>
      {children}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const setLink = () => {
    const prev = editor.getAttributes('link').href ?? '';
    const url = window.prompt('URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
      padding: '8px 10px', marginBottom: 12,
      background: 'rgba(16,28,52,0.85)',
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      border: '0.5px solid rgba(80,140,255,0.22)', borderRadius: 12,
      boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
    }}>
      <Group>
        <ToolbarBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolbarBtn>
        <ToolbarBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolbarBtn>
        <ToolbarBtn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></ToolbarBtn>
      </Group>
      <Group>
        <ToolbarBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} /></ToolbarBtn>
        <ToolbarBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></ToolbarBtn>
        <ToolbarBtn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} /></ToolbarBtn>
      </Group>
      <Group>
        <select
          title="Font family"
          value={editor.getAttributes('textStyle').fontFamily || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
          style={{ height: 30, borderRadius: 6, fontSize: 12, padding: '0 6px', background: 'rgba(16,28,52,0.55)', color: 'rgba(200,225,255,0.85)', border: '0.5px solid rgba(80,140,255,0.18)' }}
        >
          {FONT_FAMILIES.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
        <select
          title="Font size"
          value={editor.getAttributes('textStyle').fontSize || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) (editor.chain().focus() as any).unsetFontSize().run();
            else (editor.chain().focus() as any).setFontSize(v).run();
          }}
          style={{ height: 30, borderRadius: 6, fontSize: 12, padding: '0 6px', background: 'rgba(16,28,52,0.55)', color: 'rgba(200,225,255,0.85)', border: '0.5px solid rgba(80,140,255,0.18)' }}
        >
          <option value="">Size</option>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Group>
      <Group>
        <label title="Text color" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(200,225,255,0.7)' }}>
          A
          <input
            type="color"
            value={editor.getAttributes('textStyle').color || '#ffffff'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </label>
        <label title="Highlight" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(200,225,255,0.7)' }}>
          H
          <input
            type="color"
            value={editor.getAttributes('highlight').color || '#ffeb3b'}
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
            style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </label>
      </Group>
      <Group>
        <ToolbarBtn title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolbarBtn>
        <ToolbarBtn title="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={14} /></ToolbarBtn>
      </Group>
      <Group>
        <ToolbarBtn title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={14} /></ToolbarBtn>
        <ToolbarBtn title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={14} /></ToolbarBtn>
        <ToolbarBtn title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={14} /></ToolbarBtn>
        <ToolbarBtn title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={14} /></ToolbarBtn>
      </Group>
      <Group>
        <ToolbarBtn title="Insert link" active={editor.isActive('link')} onClick={setLink}><LinkIcon size={14} /></ToolbarBtn>
        <ToolbarBtn
          title="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <Eraser size={14} />
        </ToolbarBtn>
      </Group>
    </div>
  );
}

function formatJustNow(ts: Date | null) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return ts.toLocaleTimeString();
}

export function AgendaEditor() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { reportingPeriod } = useInsightsTimeframe();
  // Fall back to the same default the picker seeds with so we always have a
  // valid (period_type, period_key) pair even before the user opens the picker.
  const activePeriod = reportingPeriod ?? reportingPeriodHelpers.defaultReportingPeriod('quarter');
  const periodType = activePeriod.view;
  const periodKey = activePeriod.period;
  const periodLabel = activePeriod.label;

  const [loaded, setLoaded] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [copying, setCopying] = useState(false);
  const [, force] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const latestDocRef = useRef<any>(null);
  const periodRef = useRef<{ type: string; key: string }>({ type: periodType, key: periodKey });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: SEED_CONTENT,
    editorProps: {
      attributes: {
        class: 'agenda-prose',
        style: 'outline:none;min-height:60vh;padding:32px 40px;color:rgba(230,240,255,0.92);font-size:14px;line-height:1.7;',
      },
    },
  });

  const persist = useCallback(async (doc: any, type: string, key: string) => {
    if (!user?.id || !company?.id) return;
    // Client-side schema validation mirroring the DB CHECK constraint.
    const parsed = agendaPersistSchema.safeParse({
      period_type: type,
      period_key: key,
      content_json: doc ?? {},
    });
    if (!parsed.success) {
      setSaveState('error');
      toast.error('Invalid reporting period', {
        description: 'Agenda was not saved. Please re-select a valid month or quarter.',
      });
      return;
    }
    setSaveState('saving');
    const payload = {
      user_id: user.id,
      company_id: company.id,
      period_type: type,
      period_key: key,
      content_json: doc,
    } as any;
    const { data, error } = await supabase
      .from('insights_agenda')
      .upsert(payload, { onConflict: 'user_id,company_id,period_type,period_key' })
      .select('id, updated_at')
      .maybeSingle();
    if (error) {
      setSaveState('error');
      // Surface the DB-side CHECK failure with the same friendly copy.
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('period_key') || msg.includes('check')) {
        toast.error('Invalid reporting period', { description: error.message });
      } else {
        toast.error('Failed to save agenda', { description: error.message });
      }
      return;
    }
    if (data) {
      setRowId(data.id);
      setSavedAt(new Date(data.updated_at));
    }
    setSaveState('saved');
  }, [user?.id, company?.id]);

  // Flush pending save (used before switching periods or unmount)
  const flushPending = useCallback(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (latestDocRef.current) {
      const { type, key } = periodRef.current;
      void persist(latestDocRef.current, type, key);
      latestDocRef.current = null;
    }
  }, [persist]);

  // Load / reload row whenever the active period changes.
  useEffect(() => {
    if (!user?.id || !company?.id || !editor) return;
    // Flush any in-flight edits to the previous period before switching.
    flushPending();
    let cancelled = false;
    setLoaded(false);
    setSaveState('idle');
    setSavedAt(null);
    setRowId(null);
    periodRef.current = { type: periodType, key: periodKey };
    (async () => {
      const { data, error } = await supabase
        .from('insights_agenda')
        .select('id, content_json, updated_at')
        .eq('user_id', user.id)
        .eq('company_id', company.id)
        .eq('period_type', periodType)
        .eq('period_key', periodKey)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setRowId(data.id);
        const hasContent = data.content_json && Object.keys(data.content_json as any).length > 0;
        editor.commands.setContent(
          hasContent ? (data.content_json as any) : SEED_CONTENT,
          { emitUpdate: false },
        );
        setIsEmpty(!hasContent || isSeedContent(data.content_json));
        if (data.updated_at) setSavedAt(new Date(data.updated_at));
      } else {
        editor.commands.setContent(SEED_CONTENT, { emitUpdate: false });
        setIsEmpty(true);
      }
      latestDocRef.current = null;
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, company?.id, editor, periodType, periodKey]);

  // Debounced autosave on update — always writes to the CURRENT period.
  useEffect(() => {
    if (!editor || !loaded) return;
    const handler = () => {
      const doc = editor.getJSON();
      latestDocRef.current = doc;
      setIsEmpty(editor.isEmpty || isSeedContent(doc));
      setSaveState('saving');
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      const { type, key } = periodRef.current;
      debounceRef.current = window.setTimeout(() => { void persist(doc, type, key); }, 1000);
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, loaded, persist]);

  // Re-render the "saved … ago" indicator every 15s
  useEffect(() => {
    const id = window.setInterval(() => force(x => x + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  // Flush on unmount
  useEffect(() => () => { flushPending(); }, [flushPending]);

  // Copy from previous period: fetches the most recent earlier row for this
  // (user, company) and replaces the current editor content if empty.
  const handleCopyFromPrevious = useCallback(async () => {
    if (!editor || !user?.id || !company?.id || copying) return;
    setCopying(true);
    try {
      const prevKey = previousPeriodKey(periodType as 'month' | 'quarter', periodKey);
      // Snapshot the editor's current (empty/seed) state so we can undo.
      const snapshot = editor.getJSON();
      let prev: any = null;
      let usedKey: string | null = prevKey;
      if (prevKey) {
        const { data } = await supabase
          .from('insights_agenda')
          .select('content_json')
          .eq('user_id', user.id)
          .eq('company_id', company.id)
          .eq('period_type', periodType)
          .eq('period_key', prevKey)
          .maybeSingle();
        prev = data?.content_json ?? null;
      }
      // Fallback: most recent earlier row of the same granularity.
      if (!prev) {
        const { data } = await supabase
          .from('insights_agenda')
          .select('content_json, period_key')
          .eq('user_id', user.id)
          .eq('company_id', company.id)
          .eq('period_type', periodType)
          .lt('period_key', periodKey)
          .order('period_key', { ascending: false })
          .limit(1)
          .maybeSingle();
        prev = data?.content_json ?? null;
        usedKey = data?.period_key ?? null;
      }
      if (!prev || Object.keys(prev).length === 0 || isSeedContent(prev)) {
        toast('No previous agenda found');
        return;
      }
      // Apply the copied content. setContent lands on the TipTap undo stack
      // (Ctrl/Cmd+Z) and the toast also exposes an explicit Undo action.
      editor.chain().focus().setContent(prev, { emitUpdate: true }).run();
      const doc = editor.getJSON();
      latestDocRef.current = doc;
      setIsEmpty(false);
      void persist(doc, periodType, periodKey);
      const prevLabel = usedKey
        ? formatPeriodLabel(periodType as 'month' | 'quarter', usedKey)
        : 'previous period';
      toast.success(`Copied agenda from ${prevLabel}`, {
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: () => {
            editor.chain().focus().setContent(snapshot, { emitUpdate: true }).run();
            const reverted = editor.getJSON();
            latestDocRef.current = reverted;
            setIsEmpty(isSeedContent(reverted));
            void persist(reverted, periodType, periodKey);
          },
        },
      });
    } finally {
      setCopying(false);
    }
  }, [editor, user?.id, company?.id, periodType, periodKey, persist, copying]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px 32px' }}>
      <style>{`
        .agenda-prose h1 { font-size: 28px; font-weight: 700; margin: 24px 0 12px; color: rgba(235,245,255,0.95); }
        .agenda-prose h2 { font-size: 22px; font-weight: 700; margin: 22px 0 2px; color: rgba(230,240,255,0.95); padding-bottom: 0; }
        /* The seeded subtitle paragraph sits directly after each H2 heading.
           Move the section divider line BELOW the subtitle by attaching the
           border-bottom to that paragraph instead of the heading itself. */
        .agenda-prose h2 + p { margin-top: 0; padding-bottom: 6px; border-bottom: 1px solid rgba(80,140,255,0.15); margin-bottom: 10px; }
        .agenda-prose h3 { font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: rgba(225,235,255,0.9); }
        .agenda-prose p { margin: 6px 0; }
        .agenda-prose ul { list-style: disc; padding-left: 22px; }
        .agenda-prose ol { list-style: decimal; padding-left: 22px; }
        .agenda-prose ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
        .agenda-prose ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .agenda-prose ul[data-type="taskList"] li > label { margin-top: 4px; }
        .agenda-prose a { color: #7ed0ff; text-decoration: underline; }
        .agenda-prose mark { padding: 0 2px; border-radius: 2px; }
        .agenda-prose blockquote { border-left: 3px solid rgba(80,140,255,0.4); padding-left: 12px; color: rgba(200,225,255,0.75); margin: 10px 0; }
      `}</style>
      <Toolbar editor={editor} />
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
        height: 18, marginBottom: 4, fontSize: 11, color: 'rgba(180,210,245,0.7)',
      }}>
        {isEmpty && loaded && (
          <button
            type="button"
            onClick={handleCopyFromPrevious}
            disabled={copying}
            title="Copy from previous period (undoable)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999,
              border: '0.5px solid rgba(80,140,255,0.28)',
              background: 'rgba(16,28,52,0.55)',
              color: 'rgba(200,225,255,0.85)',
              fontSize: 11, cursor: copying ? 'wait' : 'pointer',
              marginRight: 6,
            }}
          >
            <Copy size={11} /> Copy from previous period
          </button>
        )}
        <span
          title={`Agenda for ${periodLabel}`}
          style={{
            display: 'inline-flex', alignItems: 'center', padding: '1px 8px',
            borderRadius: 999, marginRight: 6,
            border: '0.5px solid rgba(80,140,255,0.35)',
            background: 'rgba(80,140,255,0.12)',
            color: 'rgba(200,225,255,0.95)', fontWeight: 600,
          }}
        >
          {periodLabel}
        </span>
        {saveState === 'saving' && (<><Loader2 size={12} className="animate-spin" /> Saving…</>)}
        {saveState === 'saved' && savedAt && (<><Check size={12} /> Saved · {formatJustNow(savedAt)}</>)}
        {saveState === 'error' && (<span style={{ color: '#f87171' }}>Save failed — will retry</span>)}
      </div>
      <div style={{
        background: 'rgba(10,20,40,0.55)',
        border: '0.5px solid rgba(80,140,255,0.18)',
        borderRadius: 14,
        boxShadow: '0 4px 22px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)',
        minHeight: '60vh',
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default AgendaEditor;