import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Heading2,
  Loader2,
  Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const PLACEHOLDER = `Wins · Blockers · Trends · Next actions

Capture the story behind this week's pipeline performance.`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function NaitivePipelineNarrative() {
  const [content, setContent] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const saveTimer = useRef<number | null>(null);
  const lastSaved = useRef<string>('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: 'text-primary underline underline-offset-2' },
      }),
      Placeholder.configure({ placeholder: PLACEHOLDER }),
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3 min-h-[260px] text-foreground',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setContent(html);
      scheduleSave(html);
    },
  });

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('naitive_pipeline_narratives')
        .select('content, updated_at')
        .eq('company_id', FIFTH_LINE_COMPANY_ID)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setContent(data.content || '');
        lastSaved.current = data.content || '';
        setUpdatedAt(data.updated_at ? new Date(data.updated_at) : null);
        editor?.commands.setContent(data.content || '', { emitUpdate: false } as any);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const persist = useCallback(async (html: string) => {
    if (html === lastSaved.current) return;
    setSaveState('saving');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('naitive_pipeline_narratives')
        .upsert(
          {
            company_id: FIFTH_LINE_COMPANY_ID,
            content: html,
            updated_by: userData.user?.id ?? null,
          },
          { onConflict: 'company_id' },
        );
      if (error) throw error;
      lastSaved.current = html;
      setUpdatedAt(new Date());
      setSaveState('saved');
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err) {
      console.error('[NaitivePipelineNarrative] save failed', err);
      setSaveState('error');
    }
  }, []);

  const scheduleSave = useCallback((html: string) => {
    if (!loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(html), 800);
  }, [loaded, persist]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const tbBtn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
  ) => (
    <Button
      type="button"
      size="icon"
      variant={active ? 'secondary' : 'ghost'}
      className="h-7 w-7"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {icon}
    </Button>
  );

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Pipeline Narrative
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Capture the story behind this week's pipeline performance, blockers, themes, and next actions.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
            {saveState === 'saving' && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>)}
            {saveState === 'saved' && (<><Check className="h-3 w-3 text-green-600" /> Saved</>)}
            {saveState === 'error' && (<span className="text-destructive">Save failed</span>)}
            {saveState === 'idle' && updatedAt && (
              <span>Updated {formatDistanceToNow(updatedAt, { addSuffix: true })}</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1 flex-1 flex flex-col min-h-0">
        <div className="flex flex-wrap items-center gap-0.5 border border-border rounded-t-md bg-muted/30 px-1.5 py-1">
          {tbBtn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <BoldIcon className="h-3.5 w-3.5" />, 'Bold (⌘B)')}
          {tbBtn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <ItalicIcon className="h-3.5 w-3.5" />, 'Italic (⌘I)')}
          {tbBtn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="h-3.5 w-3.5" />, 'Underline (⌘U)')}
          <span className="w-px h-4 bg-border mx-1" />
          {tbBtn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="h-3.5 w-3.5" />, 'Heading')}
          {tbBtn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List className="h-3.5 w-3.5" />, 'Bulleted list')}
          {tbBtn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-3.5 w-3.5" />, 'Numbered list')}
          <span className="w-px h-4 bg-border mx-1" />
          {tbBtn(editor.isActive('link'), setLink, <LinkIcon className="h-3.5 w-3.5" />, 'Add / edit link')}
        </div>
        <div className={cn(
          'flex-1 border border-t-0 border-border rounded-b-md bg-background overflow-y-auto',
          'max-h-[520px] min-h-[260px]',
          '[&_.ProseMirror]:min-h-[260px] [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline',
          '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
          '[&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mt-2',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:whitespace-pre-line',
        )}>
          <EditorContent editor={editor} />
        </div>
      </CardContent>
    </Card>
  );
}