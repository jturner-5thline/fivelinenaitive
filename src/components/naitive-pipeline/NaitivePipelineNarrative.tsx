import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  List, ListOrdered, Link as LinkIcon, Heading2, Loader2, Check,
  Sparkles, RefreshCw, History as HistoryIcon, Pencil,
  RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { format, formatDistanceToNow, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subWeeks, subMonths, subQuarters, getISOWeek, getISOWeekYear } from 'date-fns';
import { cn } from '@/lib/utils';
import { Deal } from '@/types/deal';
import { NaitiveQualToDemoInsights } from './NaitiveQualToDemoInsights';
import { NaitiveDidNotMoveInsights } from './NaitiveDidNotMoveInsights';

type PeriodType = 'week' | 'month' | 'quarter';

interface PeriodSpec {
  type: PeriodType;
  key: string;
  start: Date;
  end: Date;
  label: string;
}

function periodFor(type: PeriodType, ref: Date): PeriodSpec {
  if (type === 'week') {
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    const key = `${getISOWeekYear(ref)}-W${String(getISOWeek(ref)).padStart(2, '0')}`;
    return { type, key, start, end, label: `Week of ${format(start, 'MMM d, yyyy')}` };
  }
  if (type === 'month') {
    const start = startOfMonth(ref);
    const end = endOfMonth(ref);
    return { type, key: format(ref, 'yyyy-MM'), start, end, label: format(ref, 'MMMM yyyy') };
  }
  const start = startOfQuarter(ref);
  const end = endOfQuarter(ref);
  const q = Math.floor(ref.getMonth() / 3) + 1;
  return { type, key: `${ref.getFullYear()}-Q${q}`, start, end, label: `Q${q} ${ref.getFullYear()}` };
}

function priorPeriod(spec: PeriodSpec): PeriodSpec {
  if (spec.type === 'week') return periodFor('week', subWeeks(spec.start, 1));
  if (spec.type === 'month') return periodFor('month', subMonths(spec.start, 1));
  return periodFor('quarter', subQuarters(spec.start, 1));
}

const PLACEHOLDER = `Wins · Blockers · Trends · Next actions

Capture the story behind this period's pipeline performance.`;

const STARTER_TEMPLATE = `<h3>Wins</h3><ul><li></li></ul><h3>Blockers</h3><ul><li></li></ul><h3>Trends</h3><ul><li></li></ul><h3>Next actions</h3><ul><li></li></ul>`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface NarrativeRow {
  id: string;
  content: string;
  period_type: string;
  period_key: string;
  period_start: string | null;
  period_end: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface SnapshotRow {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
}

const MAX_SNAPSHOTS = 10;
const SNAPSHOT_MIN_INTERVAL_MS = 60_000; // throttle: at most one snapshot per minute

interface AnalysisResult {
  empty?: boolean;
  message?: string;
  editor_view?: {
    new_themes: string[];
    repeated_themes: string[];
    improving: string[];
    worsening: string[];
    blockers_added: string[];
    blockers_removed: string[];
    tone: string;
    biggest_shift: string;
  };
  viewer_view?: {
    what_changed: string;
    what_remains: string;
    biggest_risk: string;
    biggest_positive: string;
    recommended_focus: string[];
  };
  chips?: { label: string; kind: 'new-risk' | 'improved' | 'repeated-theme' | 'escalating' | 'resolved' }[];
  meta?: { currentLabel: string; priorLabel: string; hasPrior: boolean };
}

const CHIP_STYLES: Record<string, string> = {
  'new-risk': 'border-destructive/40 text-destructive bg-destructive/5',
  'improved': 'border-green-500/40 text-green-600 bg-green-500/5',
  'repeated-theme': 'border-muted-foreground/30 text-muted-foreground bg-muted/30',
  'escalating': 'border-orange-500/40 text-orange-600 bg-orange-500/5',
  'resolved': 'border-blue-500/40 text-blue-600 bg-blue-500/5',
};

const CHIP_LABEL: Record<string, string> = {
  'new-risk': 'New risk',
  'improved': 'Improved',
  'repeated-theme': 'Repeated',
  'escalating': 'Escalating',
  'resolved': 'Resolved',
};

interface Props {
  /** Outer dashboard reporting period — drives default selected period and prior comparison */
  reportingPeriod?: 'week' | 'month' | 'quarter';
  /** All deals in the naitive pipeline — used by the Qual→Demo and Did-Not-Move tabs. */
  deals?: Deal[];
}

export function NaitivePipelineNarrative({ reportingPeriod = 'week', deals = [] }: Props) {
  const [periodType, setPeriodType] = useState<PeriodType>(reportingPeriod);
  const today = useMemo(() => new Date(), []);
  const current = useMemo(() => periodFor(periodType, today), [periodType, today]);
  const prior = useMemo(() => priorPeriod(current), [current]);

  // Sync to outer dashboard period if it changes
  useEffect(() => { setPeriodType(reportingPeriod); }, [reportingPeriod]);

  const [content, setContent] = useState<string>('');
  const [priorContent, setPriorContent] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [updatedByEmail, setUpdatedByEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<NarrativeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tab, setTab] = useState<'narrative' | 'analysis' | 'qual-demo' | 'did-not-move' | 'history'>('narrative');

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDraftAware, setAnalysisDraftAware] = useState(false);

  const saveTimer = useRef<number | null>(null);
  const analysisTimer = useRef<number | null>(null);
  const lastSaved = useRef<string>('');
  const lastSnapshotAt = useRef<number>(0);
  const lastSnapshotContent = useRef<string>('');

  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false, autolink: true,
        HTMLAttributes: { class: 'text-primary underline underline-offset-2' },
      }),
      Placeholder.configure({ placeholder: PLACEHOLDER }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3 min-h-[260px] text-foreground',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setContent(html);
      scheduleSave(html);
      scheduleAnalysis(html, true);
    },
  });

  // Load narratives for company (current + prior + history) when period changes
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const { data, error } = await supabase
        .from('naitive_pipeline_narratives')
        .select('id, content, period_type, period_key, period_start, period_end, updated_at, updated_by')
        .eq('company_id', FIFTH_LINE_COMPANY_ID)
        .eq('period_type', periodType)
        .order('period_start', { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (error) {
        console.error('[narrative] load error', error);
      }
      const rows = (data || []) as NarrativeRow[];
      setHistory(rows);
      const cur = rows.find((r) => r.period_key === current.key);
      const pri = rows.find((r) => r.period_key === prior.key);
      const curContent = cur?.content || '';
      const initialContent = curContent || STARTER_TEMPLATE;
      setContent(initialContent);
      // Keep lastSaved as the actual saved content (empty) so the starter
      // template is not persisted until the user actually edits it.
      lastSaved.current = curContent;
      setUpdatedAt(cur?.updated_at ? new Date(cur.updated_at) : null);
      editor.commands.setContent(initialContent, { emitUpdate: false } as any);
      setPriorContent(pri?.content || '');
      setLoaded(true);
      // Resolve last editor email
      if (cur?.updated_by) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', cur.updated_by)
          .maybeSingle();
        if (!cancelled) setUpdatedByEmail(prof?.display_name || null);
      } else {
        setUpdatedByEmail(null);
      }
      // Kick off analysis based on saved content
      runAnalysis(curContent, pri?.content || '', false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, periodType, current.key, prior.key]);

  // Load snapshots for the current period
  const loadSnapshots = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('naitive_pipeline_narrative_snapshots')
      .select('id, content, created_at, created_by')
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .eq('period_type', current.type)
      .eq('period_key', current.key)
      .order('created_at', { ascending: false })
      .limit(MAX_SNAPSHOTS);
    if (error) {
      console.error('[narrative] snapshots load error', error);
      return;
    }
    setSnapshots((data || []) as SnapshotRow[]);
  }, [current.type, current.key]);

  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

  const recordSnapshot = useCallback(async (html: string) => {
    if (!html) return;
    if (html === lastSnapshotContent.current) return;
    const now = Date.now();
    if (now - lastSnapshotAt.current < SNAPSHOT_MIN_INTERVAL_MS) return;
    lastSnapshotAt.current = now;
    lastSnapshotContent.current = html;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('naitive_pipeline_narrative_snapshots')
        .insert({
          company_id: FIFTH_LINE_COMPANY_ID,
          period_type: current.type,
          period_key: current.key,
          content: html,
          created_by: userData.user?.id ?? null,
        });
      if (error) throw error;
      // Trim older snapshots beyond MAX_SNAPSHOTS
      const { data: all } = await (supabase as any)
        .from('naitive_pipeline_narrative_snapshots')
        .select('id, created_at')
        .eq('company_id', FIFTH_LINE_COMPANY_ID)
        .eq('period_type', current.type)
        .eq('period_key', current.key)
        .order('created_at', { ascending: false });
      const rows = (all || []) as { id: string; created_at: string }[];
      const stale = rows.slice(MAX_SNAPSHOTS).map((r) => r.id);
      if (stale.length > 0) {
        await (supabase as any)
          .from('naitive_pipeline_narrative_snapshots')
          .delete()
          .in('id', stale);
      }
      void loadSnapshots();
    } catch (e) {
      console.error('[narrative] snapshot failed', e);
    }
  }, [current.type, current.key, loadSnapshots]);

  const restoreSnapshot = useCallback((snap: SnapshotRow) => {
    if (!editor) return;
    if (!window.confirm('Restore this snapshot? Your current draft will be replaced (and saved as a new snapshot).')) return;
    // Snapshot the current state first so the user can undo the restore
    void recordSnapshot(content);
    editor.commands.setContent(snap.content || '', { emitUpdate: false } as any);
    setContent(snap.content || '');
    void persist(snap.content || '');
  }, [editor, content, recordSnapshot]);

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
            period_type: current.type,
            period_key: current.key,
            period_start: format(current.start, 'yyyy-MM-dd'),
            period_end: format(current.end, 'yyyy-MM-dd'),
            updated_by: userData.user?.id ?? null,
          } as any,
          { onConflict: 'company_id,period_type,period_key' },
        );
      if (error) throw error;
      lastSaved.current = html;
      setUpdatedAt(new Date());
      setSaveState('saved');
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
      // Capture a versioned snapshot (throttled, deduped, capped)
      void recordSnapshot(html);
    } catch (err) {
      console.error('[narrative] save failed', err);
      setSaveState('error');
    }
  }, [current]);

  const scheduleSave = useCallback((html: string) => {
    if (!loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(html), 800);
  }, [loaded, persist]);

  const runAnalysis = useCallback(async (curHtml: string, priorHtml: string, draftAware: boolean) => {
    setAnalysisDraftAware(draftAware);
    if (!curHtml && !priorHtml) {
      setAnalysis({ empty: true, message: 'No prior narrative available for comparison yet. Start writing weekly narratives to unlock period-over-period commentary.' });
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const { data, error } = await supabase.functions.invoke('naitive-narrative-analysis', {
        body: {
          currentContent: curHtml,
          priorContent: priorHtml,
          currentLabel: current.label,
          priorLabel: prior.label,
          mode: draftAware ? 'editor' : 'viewer',
        },
      });
      if (error) throw error;
      setAnalysis(data as AnalysisResult);
    } catch (e: any) {
      console.error('[narrative] analysis failed', e);
      setAnalysisError(e?.message || 'Analysis failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [current.label, prior.label]);

  const scheduleAnalysis = useCallback((html: string, draftAware: boolean) => {
    if (!loaded) return;
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current);
    analysisTimer.current = window.setTimeout(() => runAnalysis(html, priorContent, draftAware), 2500);
  }, [loaded, priorContent, runAnalysis]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current);
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

  const tbBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, title: string) => (
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

  const chips = analysis?.chips || [];

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Pipeline Narrative
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Capture the story behind this period's pipeline — AI compares it to the prior period.
            </p>
          </div>
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="quarter">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground mt-2">
          <Badge variant="outline" className="text-[10px] font-normal">{current.label}</Badge>
          <span>·</span>
          <span>Compared to {prior.label}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {saveState === 'saving' && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>)}
            {saveState === 'saved' && (<><Check className="h-3 w-3 text-green-600" /> Saved</>)}
            {saveState === 'error' && (<span className="text-destructive">Save failed</span>)}
            {saveState === 'idle' && updatedAt && (
              <span>
                Updated {formatDistanceToNow(updatedAt, { addSuffix: true })}
                {updatedByEmail ? ` · ${updatedByEmail}` : ''}
              </span>
            )}
          </span>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chips.map((c, i) => (
              <Badge
                key={`${c.kind}-${i}`}
                variant="outline"
                className={cn('text-[10px] gap-1', CHIP_STYLES[c.kind])}
                title={CHIP_LABEL[c.kind]}
              >
                <span className="font-medium">{CHIP_LABEL[c.kind]}:</span> {c.label}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1 flex-1 flex flex-col min-h-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-5 h-8">
            <TabsTrigger value="narrative" className="text-xs gap-1"><Pencil className="h-3 w-3" />Narrative</TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs gap-1"><Sparkles className="h-3 w-3" />AI Analysis</TabsTrigger>
            <TabsTrigger value="qual-demo" className="text-xs gap-1"><Sparkles className="h-3 w-3" />Qual → Demo</TabsTrigger>
            <TabsTrigger value="did-not-move" className="text-xs gap-1"><Sparkles className="h-3 w-3" />Did Not Move</TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1"><HistoryIcon className="h-3 w-3" />History</TabsTrigger>
          </TabsList>

          <TabsContent value="narrative" className="mt-3 flex-1 flex flex-col min-h-0 data-[state=inactive]:hidden">
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
              'max-h-[460px] min-h-[260px]',
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
          </TabsContent>

          <TabsContent value="analysis" className="mt-3 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <AnalysisPanel
              analysis={analysis}
              loading={analysisLoading}
              error={analysisError}
              draftAware={analysisDraftAware}
              onRefresh={() => runAnalysis(content, priorContent, false)}
            />
          </TabsContent>

          <TabsContent value="qual-demo" className="mt-3 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            {deals.length > 0 ? (
              <NaitiveQualToDemoInsights deals={deals} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data yet for this view.</p>
            )}
          </TabsContent>

          <TabsContent value="did-not-move" className="mt-3 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            {deals.length > 0 ? (
              <NaitiveDidNotMoveInsights deals={deals} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data yet for this view.</p>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-3 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <HistoryPanel
              rows={history}
              currentKey={current.key}
              snapshots={snapshots}
              onRestore={restoreSnapshot}
              currentLabel={current.label}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone?: 'good' | 'bad' | 'neutral' }) {
  if (!items || items.length === 0) return null;
  const color =
    tone === 'good' ? 'text-green-600'
    : tone === 'bad' ? 'text-destructive'
    : 'text-foreground';
  return (
    <div>
      <p className={cn('text-[11px] font-semibold uppercase tracking-wide', color)}>{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-foreground/90 flex gap-1.5">
            <span className="text-muted-foreground">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisPanel({
  analysis, loading, error, draftAware, onRefresh,
}: {
  analysis: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  draftAware: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (loading && !analysis) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Analyzing narrative…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        {error}
        <Button size="sm" variant="ghost" className="ml-2 h-6 px-2 text-xs" onClick={onRefresh}>Retry</Button>
      </div>
    );
  }
  if (!analysis || analysis.empty) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground text-center">
        {analysis?.message || 'No prior narrative available for comparison yet.'}
      </div>
    );
  }

  const v = analysis.viewer_view;
  const e = analysis.editor_view;
  const hasDetails = !!e;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[10px] gap-1">
          <Sparkles className="h-3 w-3" />
          {draftAware ? 'Draft-aware analysis' : 'Based on saved narrative'}
        </Badge>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {v && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Executive summary</p>
          <div className="space-y-1.5 text-xs text-foreground">
            {v.what_changed && <p><span className="font-semibold">What changed: </span>{v.what_changed}</p>}
            {v.what_remains && <p><span className="font-semibold">Consistent: </span>{v.what_remains}</p>}
            {v.biggest_risk && <p><span className="font-semibold text-destructive">Biggest risk: </span>{v.biggest_risk}</p>}
            {v.biggest_positive && <p><span className="font-semibold text-green-600">Biggest positive: </span>{v.biggest_positive}</p>}
          </div>
          {v.recommended_focus && v.recommended_focus.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mt-1">Recommended focus</p>
              <ul className="mt-1 space-y-0.5">
                {v.recommended_focus.map((it, i) => (
                  <li key={i} className="text-xs flex gap-1.5"><span className="text-primary">→</span><span>{it}</span></li>
                ))}
              </ul>
            </div>
          )}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>Hide details <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>Expand for details <ChevronDown className="h-3 w-3" /></>
              )}
            </button>
          )}
        </div>
      )}

      {e && expanded && (
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Editor view</p>
            <Badge variant="outline" className="text-[10px]">Tone: {e.tone}</Badge>
          </div>
          {e.biggest_shift && (
            <p className="text-xs text-foreground italic">"{e.biggest_shift}"</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Section title="New themes" items={e.new_themes} tone="neutral" />
            <Section title="Repeated themes" items={e.repeated_themes} tone="neutral" />
            <Section title="Improving" items={e.improving} tone="good" />
            <Section title="Worsening" items={e.worsening} tone="bad" />
            <Section title="Blockers added" items={e.blockers_added} tone="bad" />
            <Section title="Blockers removed" items={e.blockers_removed} tone="good" />
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({
  rows, currentKey, snapshots, onRestore, currentLabel,
}: {
  rows: NarrativeRow[];
  currentKey: string;
  snapshots: SnapshotRow[];
  onRestore: (snap: SnapshotRow) => void;
  currentLabel: string;
}) {
  return (
    <div className="space-y-5">
      {/* Snapshots for the current period */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Autosaved versions · {currentLabel}
          </p>
          <span className="text-[10px] text-muted-foreground">Last {MAX_SNAPSHOTS}</span>
        </div>
        {snapshots.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground text-center">
            No autosaved versions yet — edits are snapshotted as you write.
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.map((s, i) => (
              <div key={s.id} className="rounded-md border border-border bg-card/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px]">v{snapshots.length - i}</Badge>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {format(new Date(s.created_at), 'MMM d, h:mm a')} · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={() => onRestore(s)}
                    title="Restore this version"
                  >
                    <RotateCcw className="h-3 w-3" /> Restore
                  </Button>
                </div>
                <div
                  className="text-xs text-foreground/80 line-clamp-3 prose prose-xs dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: s.content || '<em class="text-muted-foreground">Empty</em>' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Period-level narrative history */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Past periods
        </p>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground text-center">
            No saved narratives yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
        const isCurrent = r.period_key === currentKey;
        const start = r.period_start ? new Date(r.period_start) : null;
        return (
          <div key={r.id} className={cn(
            'rounded-md border p-3 space-y-1',
            isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border bg-card/40',
          )}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{r.period_key}</span>
                {start && (
                  <span className="text-[10px] text-muted-foreground">{format(start, 'MMM d, yyyy')}</span>
                )}
                {isCurrent && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
              </span>
            </div>
            <div
              className="text-xs text-foreground/80 line-clamp-3 prose prose-xs dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: r.content || '<em class="text-muted-foreground">Empty</em>' }}
            />
          </div>
        );
            })}
          </div>
        )}
      </div>
    </div>
  );
}