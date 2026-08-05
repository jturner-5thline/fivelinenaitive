import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FileText, Mail, Plus, X, Eye, EyeOff, Loader2, Sparkles, Download } from 'lucide-react';
import { Deal } from '@/types/deal';
import type { StatusReportEditableContent, LenderStageConfig, OutstandingItem } from '@/utils/dealExport';
import { bucketLenders, extractPassDetails, isExcludedFromClientReport } from '@/lib/lenderStatusBuckets';
import { sendClaudeMessage } from '@/services/claude';
import { rewritePassedFeedback } from '@/lib/rewritePassFeedback';
import { toast } from '@/hooks/use-toast';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { LenderPipelineSnapshot } from './LenderPipelineSnapshot';
import type { DealLender } from '@/types/deal';
import { useCompany } from '@/hooks/useCompany';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { printNodeInPopup } from '@/lib/printNodeInPopup';
import { saveNodePdfToDealSpace } from '@/lib/deal/saveNodePdfToDealSpace';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export type { StatusReportEditableContent };

interface StatusReportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  configuredStages?: LenderStageConfig[];
  configuredSubstages?: LenderStageConfig[];
  outstandingItems?: OutstandingItem[];
  onExport: (content: StatusReportEditableContent) => void;
  /**
   * Persist a funding source update to the underlying deal. Required for the
   * pipeline-snapshot stage cards to act as a live management surface
   * (clicking a card opens an editable lender dialog that writes through
   * to the real lender record). When omitted, the cards remain visual.
   */
  onUpdateLender?: (lenderId: string, updates: Partial<DealLender>) => Promise<void>;
}

const todayLong = () =>
  new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function buildInitialContent(
  deal: Deal,
  configuredStages?: LenderStageConfig[],
  outstandingItems?: OutstandingItem[],
): StatusReportEditableContent {
  const rawNotes = deal.notes || '';
  const stripped = rawNotes.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const bullets = stripped.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  const lenderRows = (deal.lenders || [])
    .filter((l) => !isExcludedFromClientReport(l as any, configuredStages))
    .filter((l) => (l.trackingStatus || '').toLowerCase() !== 'passed')
    .map((lender) => ({
      name: lender.name,
      processStage: configuredStages?.find((s) => s.id === lender.stage)?.label || lender.stage || '',
      focusAreas: '',
      challenges: '',
      nextAction: lender.notes || '',
    }));

  const completed = (deal.milestones || []).filter((m) => m.completed).map((m) => m.title);
  const upcoming = (deal.milestones || []).filter((m) => !m.completed).map((m) => m.title);

  const pending = (outstandingItems || []).filter((i) => !i.completed && !i.received);
  const actionText =
    pending.length > 0 ? pending.map((i) => i.text).join('\n') : 'No action items at this time.';

  return {
    keyUpdates: bullets.length > 0 ? bullets.slice(0, 5) : [''],
    statusSummary: [],
    statusSummaryHtml: '',
    lenderRows,
    completedMilestones: completed,
    nextSteps: upcoming,
    actionItems: actionText,
    sectionsVisible: {
      keyUpdates: true,
      statusSummary: true,
      lenderTable: false,
      pipelineSnapshot: true,
      milestones: true,
      nextSteps: true,
      actionItems: true,
    },
  };
}

/** Try to parse a Claude response as a JSON object containing
 *  { statusSummary?: string[]; recentMilestones?: string[]; nextSteps?: string[] }.
 *  Falls back to extracting bullet-like lines per section heading. */
function parseAiSections(text: string): {
  statusSummary: string[];
  statusSummaryNarrative: string;
  recentMilestones: string[];
  nextSteps: string[];
} {
  const empty = { statusSummary: [], statusSummaryNarrative: '', recentMilestones: [], nextSteps: [] };
  if (!text) return empty;
  // Try fenced JSON first
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const arr = (v: unknown): string[] =>
        Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
      const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
      return {
        statusSummary: arr(parsed.statusSummary),
        statusSummaryNarrative: str(parsed.statusSummaryNarrative),
        recentMilestones: arr(parsed.recentMilestones),
        nextSteps: arr(parsed.nextSteps),
      };
    } catch {
      /* fall through */
    }
  }
  return empty;
}

/** Convert a plain narrative string (with \n\n paragraph breaks) to safe HTML. */
function narrativeToHtml(text: string): string {
  if (!text) return '';
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/** Convert a bullet array into HTML paragraphs joined by spaces (fallback narrative). */
function bulletsToNarrativeHtml(bullets: string[]): string {
  if (!bullets.length) return '';
  return `<p>${bullets.map((b) => b.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).join(' ')}</p>`;
}

/** Strip HTML to a plain-text bullet array (one per <p>/<li>). */
function htmlToBullets(html: string): string[] {
  if (!html) return [];
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // Prefer <li> if present; otherwise split by <p>.
  const lis = Array.from(tmp.querySelectorAll('li')).map((el) => (el.textContent || '').trim()).filter(Boolean);
  if (lis.length > 0) return lis;
  const ps = Array.from(tmp.querySelectorAll('p')).map((el) => (el.textContent || '').trim()).filter(Boolean);
  if (ps.length > 0) return ps;
  const text = (tmp.textContent || '').trim();
  return text ? [text] : [];
}

export function StatusReportPreviewModal({
  open,
  onOpenChange,
  deal,
  configuredStages,
  outstandingItems,
  onExport,
  onUpdateLender,
}: StatusReportPreviewModalProps) {
  // ── Tenant-aware branding & theme ──
  // 5th Line keeps its current navy/dark in-app treatment. All other
  // tenants get a neutral, professional light-mode treatment with the
  // current company name in place of the "5TH | LINE" wordmark.
  const { company } = useCompany();
  const isFifthLine = company?.id === FIFTH_LINE_COMPANY_ID;
  const brandName = company?.name?.trim() || '';
  const reportTheme = useMemo(() => {
    if (isFifthLine) {
      return {
        accent: '#1e3a8a',
        accentText: '#1e3a8a',
        bodyText: '#334155',
        titleText: '#0f172a',
        summaryBg: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)',
        pipeline: {
          blue:  { bg: 'linear-gradient(180deg,#eff6ff 0%,#ffffff 60%)', border: '#bfdbfe', head: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
          teal:  { bg: 'linear-gradient(180deg,#ecfeff 0%,#ffffff 60%)', border: '#a5f3fc', head: 'linear-gradient(135deg,#0ea5e9,#0d9488)' },
          green: { bg: 'linear-gradient(180deg,#f0fdf4 0%,#ffffff 60%)', border: '#bbf7d0', head: 'linear-gradient(135deg,#22c55e,#16a34a)' },
          red:   { bg: 'linear-gradient(180deg,#fef2f2 0%,#ffffff 60%)', border: '#fecaca', head: 'linear-gradient(135deg,#ef4444,#dc2626)' },
        },
      };
    }
    // Non-5th Line: neutral slate, distinctly different from navy.
    return {
      accent: '#0f172a',
      accentText: '#0f172a',
      bodyText: '#1f2937',
      titleText: '#0b1220',
      summaryBg: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)',
      pipeline: {
        blue:  { bg: '#ffffff', border: '#e2e8f0', head: 'linear-gradient(135deg,#475569,#334155)' },
        teal:  { bg: '#ffffff', border: '#e2e8f0', head: 'linear-gradient(135deg,#0f766e,#115e59)' },
        green: { bg: '#ffffff', border: '#e2e8f0', head: 'linear-gradient(135deg,#166534,#14532d)' },
        red:   { bg: '#ffffff', border: '#e2e8f0', head: 'linear-gradient(135deg,#7f1d1d,#581c1c)' },
      },
    };
  }, [isFifthLine]);
  const themedSectionLabel: React.CSSProperties = {
    ...sectionLabelStyle,
    color: isFifthLine ? '#64748b' : '#475569',
  };
  const themedListItem: React.CSSProperties = { ...listItemStyle, color: reportTheme.bodyText };
  const themedGlyph: React.CSSProperties = { ...glyphStyle, color: reportTheme.accentText };
  const themedAction: React.CSSProperties = {
    ...actionStyle,
    borderLeft: `3px solid ${reportTheme.accent}`,
    color: reportTheme.titleText,
  };

  const initialContent = useMemo(
    () => buildInitialContent(deal, configuredStages, outstandingItems),
    [deal, configuredStages, outstandingItems],
  );

  const [content, setContent] = useState<StatusReportEditableContent>(initialContent);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTriedForDeal, setAiTriedForDeal] = useState<string | null>(null);
  const printConfirmOpenRef = useRef(false);
  /**
   * AI-rewritten "Key Feedback" strings for the Passed Lender Reasons table,
   * keyed by lender name. Absence of a key = still loading; explicit empty
   * string = intentionally blank (notes too thin to support a rewrite).
   * Raw lender notes are NEVER shown in this column.
   */
  const [aiPassFeedback, setAiPassFeedback] = useState<Record<string, string>>({});
  const [aiPassFeedbackLoading, setAiPassFeedbackLoading] = useState(false);
  const passFeedbackTriedRef = useRef<string | null>(null);

  const buckets = useMemo(
    () => bucketLenders(deal.lenders, configuredStages),
    [deal.lenders, configuredStages],
  );

  const passedDetails = useMemo(
    () => buckets.passed.map((l) => ({ name: l.name, ...extractPassDetails(l) })),
    [buckets.passed],
  );


  // AI-rewrite raw pass notes into client-safe Key Feedback whenever the
  // modal opens for a new deal. One call per (deal, modal-open) cycle.
  useEffect(() => {
    if (!open) return;
    if (passFeedbackTriedRef.current === deal.id) return;
    if (buckets.passed.length === 0) {
      passFeedbackTriedRef.current = deal.id;
      setAiPassFeedback({});
      return;
    }
    passFeedbackTriedRef.current = deal.id;
    setAiPassFeedback({});
    setAiPassFeedbackLoading(true);
    rewritePassedFeedback(
      buckets.passed.map((l) => ({
        name: l.name,
        reason: extractPassDetails(l).reason,
        notes: (l as any).notes || (l as any).passReason || '',
      })),
      deal.id,
    )
      .then((map) => setAiPassFeedback(map))
      .finally(() => setAiPassFeedbackLoading(false));
  }, [open, deal.id, buckets.passed]);

  // Run Claude generation when modal opens for a given deal (once per deal/open).
  useEffect(() => {
    if (!open) return;
    if (aiTriedForDeal === deal.id) return;
    setAiTriedForDeal(deal.id);

    const lenders = (deal.lenders || []).filter(
      (l) => !isExcludedFromClientReport(l as any, configuredStages),
    );
    const lenderSummary = lenders
      .map((l) => {
        const note = (l.notes || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const stage = configuredStages?.find((s) => s.id === l.stage)?.label || l.stage;
        return `- ${l.name} | stage=${stage} | tracking=${l.trackingStatus}${note ? ` | notes=${note}` : ''}`;
      })
      .join('\n');

    const pendingItems = (outstandingItems || [])
      .filter((i) => !i.completed && !i.received)
      .map((i) => `- ${i.text}`)
      .join('\n');

    const upcomingMilestones = (deal.milestones || [])
      .filter((m) => !m.completed)
      .map((m) => `- ${m.title}${m.dueDate ? ` (due ${m.dueDate})` : ''}`)
      .join('\n');

    const completedMilestones = (deal.milestones || [])
      .filter((m) => m.completed)
      .slice(-10)
      .map((m) => `- ${m.title}`)
      .join('\n');

    const prompt = `You are drafting a client-facing status report for a financing engagement.
Return STRICT JSON only with this shape (no markdown, no commentary):
{
  "statusSummaryNarrative": "2-4 short sentences of narrative prose (executive summary). Plain text, no markdown. Use blank lines (\\n\\n) between paragraphs if needed.",
  "statusSummary": [3-5 short bullet strings — used as a fallback if narrative is empty],
  "recentMilestones": [3-5 short bullet strings, completed work in the last ~30 days],
  "nextSteps": [3-5 short bullet strings, immediate forward-looking actions]
}

Deal: ${deal.company}
Stage: ${deal.stage}
Status: ${deal.status}
${deal.narrative ? `Narrative: ${deal.narrative.replace(/<[^>]*>/g, '').slice(0, 800)}` : ''}

Lenders (${lenders.length}):
${lenderSummary || '(none)'}

Outstanding items from client:
${pendingItems || '(none)'}

Upcoming milestones:
${upcomingMilestones || '(none)'}

Recently completed milestones:
${completedMilestones || '(none)'}

Style: concise, professional, factual, client-ready. Avoid hype. No emoji.`;

    setAiLoading(true);
    sendClaudeMessage({
      messages: [{ role: 'user', content: prompt }],
      system: 'You generate concise, factual status report bullets for an investment-banking client. Always reply with valid JSON only.',
      temperature: 0.3,
      max_tokens: 800,
      context: 'deal-assistant',
      usage: { feature_subtype: 'status-report-autogen', deal_id: deal.id },
    })
      .then((res) => {
        if (!res.success) {
          toast({
            title: 'AI generation skipped',
            description: res.error || 'Could not auto-generate sections — you can still edit manually.',
          });
          return;
        }
        const parsed = parseAiSections(res.response);
        const narrativeHtml = parsed.statusSummaryNarrative
          ? narrativeToHtml(parsed.statusSummaryNarrative)
          : bulletsToNarrativeHtml(parsed.statusSummary);
        setContent((prev) => ({
          ...prev,
          statusSummary: parsed.statusSummary.length > 0 ? parsed.statusSummary : prev.statusSummary,
          statusSummaryHtml: narrativeHtml || prev.statusSummaryHtml || '',
          completedMilestones:
            parsed.recentMilestones.length > 0 ? parsed.recentMilestones : prev.completedMilestones,
          nextSteps: parsed.nextSteps.length > 0 ? parsed.nextSteps : prev.nextSteps,
        }));
      })
      .catch(() => {
        toast({ title: 'AI generation failed', description: 'You can still edit sections manually.' });
      })
      .finally(() => setAiLoading(false));
  }, [open, deal, configuredStages, outstandingItems, aiTriedForDeal]);

  const handleOpenChange = (v: boolean) => {
    // Opening a second Radix modal can ask the underlying dialog to close.
    // Keep the report mounted until export confirmation has completed so its
    // detached snapshot cannot be removed by the unmount cleanup.
    if (!v && printConfirmOpenRef.current) return;
    if (v) {
      setContent(initialContent);
      setAiTriedForDeal(null); // re-trigger AI on next open
      passFeedbackTriedRef.current = null; // re-rewrite pass feedback on next open
    }
    onOpenChange(v);
  };

  // ── Edit helpers ─────────────────────────────────────────────────────────
  const updateArrayItem = (key: keyof StatusReportEditableContent, i: number, v: string) =>
    setContent((p) => {
      const arr = [...(p[key] as string[])];
      arr[i] = v;
      return { ...p, [key]: arr };
    });
  const addArrayItem = (key: keyof StatusReportEditableContent) =>
    setContent((p) => ({ ...p, [key]: [...(p[key] as string[]), ''] }));
  const removeArrayItem = (key: keyof StatusReportEditableContent, i: number) =>
    setContent((p) => ({ ...p, [key]: (p[key] as string[]).filter((_, idx) => idx !== i) }));

  const toggleSection = (key: keyof StatusReportEditableContent['sectionsVisible']) =>
    setContent((p) => ({
      ...p,
      sectionsVisible: { ...p.sectionsVisible, [key]: !p.sectionsVisible[key] },
    }));

  // ── PDF export via window.print() — prints the SAME dark Naitive preview
  // node the user is editing, so the PDF is a high-fidelity capture (no
  // alternate light layout). We inject @media print rules that hide every
  // other element on the page and force backgrounds/gradients to render.
  const exportSourceRef = useRef<HTMLDivElement | null>(null);
  /**
   * The printable node lives in one of two mutually-exclusive branches
   * (5th Line dark preview vs. light preview). When that branch swaps —
   * or while a nested dialog is animating — React briefly sets the ref to
   * null, which is what produced the intermittent "Preview not ready"
   * toast. Resolve defensively: prefer the live ref, then fall back to a
   * DOM lookup by data attribute. The confirmation flow also captures a
   * detached-from-React snapshot, because opening the nested confirmation
   * dialog can legitimately unmount the live preview.
   */
  const resolvePrintableNode = (): HTMLDivElement | null => {
    const fromRef = exportSourceRef.current;
    if (fromRef && fromRef.isConnected) return fromRef;
    const fromDom = document.querySelector<HTMLDivElement>('[data-status-report-export-source]');
    if (fromDom) return fromDom;
    // Last resort: the stable snapshot captured before confirmation opened.
    const cached = capturedPrintableRef.current;
    return cached && cached.isConnected ? cached : null;
  };
  /** Stable DOM snapshot taken at "Export as PDF" click time. */
  const capturedPrintableRef = useRef<HTMLDivElement | null>(null);
  const clearPrintableSnapshot = () => {
    const snapshot = capturedPrintableRef.current;
    if (snapshot) snapshot.remove();
    capturedPrintableRef.current = null;
  };
  const capturePrintableSnapshot = (): HTMLDivElement | null => {
    const source = exportSourceRef.current?.isConnected
      ? exportSourceRef.current
      : document.querySelector<HTMLDivElement>('[data-status-report-export-source]');
    if (!source) return null;

    clearPrintableSnapshot();
    const snapshot = source.cloneNode(true) as HTMLDivElement;
    const sourceWidth = Math.max(source.getBoundingClientRect().width, source.scrollWidth);
    snapshot.removeAttribute('id');
    snapshot.removeAttribute('data-status-report-export-source');
    snapshot.setAttribute('data-status-report-export-snapshot', '');
    snapshot.style.position = 'fixed';
    snapshot.style.left = '-100000px';
    snapshot.style.top = '0';
    snapshot.style.width = `${sourceWidth}px`;
    snapshot.style.height = 'auto';
    snapshot.style.maxHeight = 'none';
    snapshot.style.overflow = 'visible';
    snapshot.style.pointerEvents = 'none';
    document.body.appendChild(snapshot);
    capturedPrintableRef.current = snapshot;
    return snapshot;
  };
  useEffect(() => () => clearPrintableSnapshot(), []);
  /** Wait up to ~1s for the printable node instead of failing immediately. */
  const waitForPrintableNode = async (): Promise<HTMLDivElement | null> => {
    for (let i = 0; i < 20; i++) {
      const node = resolvePrintableNode();
      if (node) return node;
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
    }
    return null;
  };
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [saveCopyToDealSpace, setSaveCopyToDealSpace] = useState(true);
  const [isSavingCopy, setIsSavingCopy] = useState(false);

  /** "[Deal]-[Account] Status Update M-D-YY" — also the PDF filename. */
  const buildFileTitle = () => {
    const account = isFifthLine ? '5th Line' : (brandName || 'Account');
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const dateStr = `${d.getMonth() + 1}-${d.getDate()}-${yy}`;
    const dealName = (deal.company || deal.name || 'Deal').toString().trim();
    const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return `${clean(dealName)}-${clean(account)} Status Update ${dateStr}`;
  };

  /** Confirm step: print, and optionally archive a copy to Documents. */
  const handleConfirmPrint = async () => {
    // Always use the stable snapshot here. The live preview may be removed as
    // soon as this confirmation closes, while PDF capture is still awaiting.
    const snapshot = capturedPrintableRef.current;
    const node = snapshot?.isConnected ? snapshot : await waitForPrintableNode();
    setShowPrintConfirm(false);
    if (!node) {
      clearPrintableSnapshot();
      toast({
        title: 'Preview not ready',
        description: 'The report could not be captured. Reopen the preview and try again.',
        variant: 'destructive',
      });
      return;
    }
    // Archive FIRST: window.print() opens a modal, blocking dialog that
    // suspends script execution in the opener, which was preventing the
    // capture/upload from ever completing.
    if (saveCopyToDealSpace && node && deal.id) {
      setIsSavingCopy(true);
      try {
        const saved = await saveNodePdfToDealSpace(node, String(deal.id), buildFileTitle());
        toast({
          title: 'Copy saved to Documents',
          description: saved?.name ? `${saved.name} added to Deal Space ▸ Documents.` : undefined,
        });
      } catch (err) {
        console.error('[status-report] save copy failed:', err);
        toast({
          title: 'Could not save a copy to Documents',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      } finally {
        setIsSavingCopy(false);
      }
    }
    handlePrintPdf(node);
    // Keep the hidden snapshot mounted until the next export/unmount. If the
    // popup is blocked, the fallback print path still needs this node when its
    // delayed window.print() runs.
  };

  const handlePrintPdf = (preresolved?: HTMLDivElement | null) => {
    const node = (preresolved && preresolved.isConnected ? preresolved : null) ?? resolvePrintableNode();
    if (!node) {
      toast({
        title: 'Preview not ready',
        description: 'The report preview finished unmounting before printing. Reopen the preview and try again.',
        variant: 'destructive',
      });
      return;
    }
    const PRINT_ID = 'naitive-status-report-printroot';
    node.setAttribute('id', PRINT_ID);
    const prevTitle = document.title;
    // Browsers use document.title as the default PDF filename for window.print().
    const fileTitle = buildFileTitle();
    document.title = fileTitle;

    // When the app runs inside an iframe (Lovable preview) the browser uses the
    // TOP document's title for the PDF filename, which produces "naitive _
    // Lovable.pdf". Printing from a standalone popup window makes our title the
    // filename in every context, so prefer that path.
    if (printNodeInPopup(node, fileTitle)) {
      document.title = prevTitle;
      return;
    }
    const style = document.createElement('style');
    style.id = 'naitive-status-report-print-style';
    style.textContent = `
      @page { size: Letter; margin: 0.25in; }
      @media print {
        html, body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          overflow: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* CRITICAL: visibility:hidden preserves layout boxes, so the entire
           app above the dialog portal would still occupy 2-3 blank pages
           before the report content. Use display:none on every direct
           body child that is NOT in the ancestor chain of the print root,
           so the report flows from page 1 with zero offset. */
        body > *:not(.naitive-print-root-branch) { display: none !important; }
        /* Inside the print-root branch, hide every sibling that isn't on
           the path to the print root — this strips the editor pane, the
           dialog header/footer, the close button, etc. so ONLY the
           preview section prints. */
        .naitive-print-ancestor > *:not(.naitive-print-ancestor):not(#${PRINT_ID}) {
          display: none !important;
        }
        /* Unwind every ancestor of the print root so the Dialog's
           max-h/overflow-hidden/scroll-container chain cannot clip the
           printed report. position:static (NOT absolute) is critical —
           absolutely-positioned roots do not paginate across pages in
           print, which is what was forcing one-page output. */
        .naitive-print-ancestor {
          all: unset !important;
          display: block !important;
          position: static !important;
          width: auto !important;
          max-width: none !important;
          height: auto !important;
          max-height: none !important;
          min-height: 0 !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          border: 0 !important;
          transform: none !important;
          inset: auto !important;
        }
        #${PRINT_ID} {
          position: static !important;
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          overflow: visible !important;
          transform: none !important;
          background: hsl(218 26% 7%) !important;
        }
        #${PRINT_ID} * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        /* Multi-page output: keep each top-level section whole; if it
           does not fit on the current page, push it entirely to the next.
           The preview's outer wrapper is the px-6 py-5 container inside
           the print root; each direct child of that container is a major
           section (header, status summary, pipeline, milestones, next
           steps, passed reasons, what we need from you). */
        #${PRINT_ID} > div > * {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        /* Inner atoms also avoid breaking awkwardly. */
        #${PRINT_ID} tr, #${PRINT_ID} li, #${PRINT_ID} thead,
        #${PRINT_ID} table {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        /* Headings should not be orphaned at page bottom. */
        #${PRINT_ID} h1, #${PRINT_ID} h2, #${PRINT_ID} h3,
        #${PRINT_ID} .sr-section-label {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
        /* Ensure no inner wrapper clips section content. */
        #${PRINT_ID} *:not(#${PRINT_ID}) {
          max-height: none !important;
        }
        /* Passed Lender Reasons must remain visible. */
        #${PRINT_ID} .passed-lender-reasons,
        #${PRINT_ID} .passed-lender-reasons * {
          display: revert !important;
          visibility: visible !important;
          height: auto !important;
          opacity: 1 !important;
        }
      }
    `;
    document.head.appendChild(style);
    // Tag every ancestor of the printable node so the print CSS can
    // un-clip the Dialog/modal/scroll-container chain that wraps it.
    const ancestors: HTMLElement[] = [];
    let p: HTMLElement | null = node.parentElement;
    let bodyChild: HTMLElement | null = null;
    while (p && p !== document.body) {
      p.classList.add('naitive-print-ancestor');
      ancestors.push(p);
      if (p.parentElement === document.body) bodyChild = p;
      p = p.parentElement;
    }
    // Mark the single direct body-child branch that contains the print
    // root, so the print CSS can `display: none` every other body child
    // (the main app, other portals, toasters, etc.). This is what
    // eliminates the 2-3 blank pages at the start of the PDF.
    if (bodyChild) bodyChild.classList.add('naitive-print-root-branch');
    const cleanup = () => {
      document.title = prevTitle;
      style.remove();
      ancestors.forEach((el) => el.classList.remove('naitive-print-ancestor'));
      if (bodyChild) bodyChild.classList.remove('naitive-print-root-branch');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 80);
  };

  // ── Render the printable report (light-themed) ──────────────────────────
  const renderPrintable = (nodeRef?: React.Ref<HTMLDivElement>, exportSource = false) => (
    <div
      ref={nodeRef}
      data-status-report-export-source={exportSource ? '' : undefined}
      className="bg-white text-slate-900 rounded-lg overflow-hidden"
    >
      <div className="sr-bar" style={{ height: 6, background: reportTheme.accent, borderRadius: 2, marginBottom: 16 }} />
      <div>
        <div className="sr-brand" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: reportTheme.accentText, textTransform: 'uppercase' }}>
          {isFifthLine ? (<>5<sup>TH</sup> | LINE</>) : (brandName || 'Status Report')}
        </div>
        <h2 className="sr-title" style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 0', color: reportTheme.titleText }}>
          {deal.company} — Status Update
        </h2>
        <div className="sr-date" style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{todayLong()}</div>
      </div>

      {content.sectionsVisible.statusSummary && (content.statusSummaryHtml?.trim() || content.statusSummary.filter(Boolean).length > 0) && (
        <>
          <div className="sr-section-label" style={themedSectionLabel}>Status Summary</div>
          <div
            className="sr-summary"
            style={{
              borderLeft: `3px solid ${reportTheme.accent}`,
              padding: '10px 0 10px 16px',
              margin: 0,
              background: reportTheme.summaryBg,
              borderRadius: 6,
              color: reportTheme.bodyText,
              fontSize: 14,
              lineHeight: 1.7,
            }}
            dangerouslySetInnerHTML={{
              __html:
                (content.statusSummaryHtml && content.statusSummaryHtml.trim()) ||
                bulletsToNarrativeHtml(content.statusSummary.filter(Boolean)),
            }}
          />
        </>
      )}

      {content.sectionsVisible.pipelineSnapshot && (
        <>
          <div className="sr-section-label" style={themedSectionLabel}>Funding Source Pipeline Snapshot</div>
          <div className="sr-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 8, alignItems: 'stretch' }}>
            {([
              { key: 'onDeck', label: 'On Deck', color: 'blue', items: buckets.onDeck },
              { key: 'inReview', label: 'In Review', color: 'teal', items: buckets.inReview },
              { key: 'termsIssued', label: 'Terms Issued', color: 'green', items: buckets.termsIssued },
              { key: 'passed', label: 'Passed', color: 'red', items: buckets.passed },
            ] as const).map((g) => (
              <div key={g.key} className={`sr-col ${g.color}`} style={colStyle(g.color, reportTheme)}>
                <div className="sr-col-head" style={colHeadStyle(g.color, reportTheme)}>{g.label} ({g.items.length})</div>
                <div className="sr-col-body" style={{ padding: '10px 12px', flex: 1 }}>
                  {g.items.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>None</p>
                  ) : (
                    g.items.map((l) => (
                      <p key={l.id} style={{ margin: '0 0 4px', fontSize: 12, color: reportTheme.bodyText, lineHeight: 1.45 }}>{l.name}</p>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {content.sectionsVisible.milestones && content.completedMilestones.filter(Boolean).length > 0 && (
        <>
          <div className="sr-section-label" style={themedSectionLabel}>Recent Milestones</div>
          <ul className="sr-list" style={listStyle}>
            {content.completedMilestones.filter(Boolean).map((m, i) => (
              <li key={i} style={themedListItem}>
                <span className="glyph" style={themedGlyph}>✓</span>{m}
              </li>
            ))}
          </ul>
        </>
      )}

      {content.sectionsVisible.nextSteps && content.nextSteps.filter(Boolean).length > 0 && (
        <>
          <div className="sr-section-label" style={themedSectionLabel}>Next Steps</div>
          <ul className="sr-list" style={listStyle}>
            {content.nextSteps.filter(Boolean).map((s, i) => (
              <li key={i} style={themedListItem}>
                <span className="glyph" style={themedGlyph}>→</span>{s}
              </li>
            ))}
          </ul>
        </>
      )}

      {passedDetails.length > 0 && (
        <>
          <div className="sr-section-label" style={themedSectionLabel}>Passed Lender Reasons</div>
          <table className="sr-passed" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '38%' }} />
              <col style={{ width: '62%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}>Funding Source</th>
                <th style={thStyle}>Key Feedback</th>
              </tr>
            </thead>
            <tbody>
              {passedDetails.map((p, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</td>
                  <td style={{ ...tdStyle, color: '#475569', fontStyle: aiPassFeedbackLoading && !(p.name in aiPassFeedback) ? 'italic' : 'normal' }}>
                    {p.name in aiPassFeedback
                      ? (aiPassFeedback[p.name] || '—')
                      : (aiPassFeedbackLoading ? 'Polishing…' : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {content.sectionsVisible.actionItems && (
        <>
          <div className="sr-section-label" style={themedSectionLabel}>What We Need From You</div>
          <div className="sr-action" style={themedAction}>
            {content.actionItems.trim() || 'Nothing needed at this time!'}
          </div>
        </>
      )}
    </div>
  );

  // ── Render the in-app dark preview (Naitive-styled, on-screen only) ─────
  // Print/PDF still uses `renderPrintable()` (light) — we render that node
  // off-screen so the existing handlePrintPdf flow keeps working.
  const renderInAppPreview = (nodeRef?: React.Ref<HTMLDivElement>, exportSource = false) => (
    <div
      ref={nodeRef}
      data-status-report-export-source={exportSource ? '' : undefined}
      className="rounded-2xl overflow-hidden border backdrop-blur-2xl"
      style={{
        // Layered gradient shell — matches the deal pop-up surface treatment:
        // soft top highlight, subtle blue-tinted radial bloom, deep base.
        backgroundColor: 'hsl(222 30% 8% / 0.96)',
        backgroundImage: [
          'radial-gradient(120% 70% at 0% 0%, hsl(220 70% 30% / 0.22) 0%, transparent 55%)',
          'radial-gradient(90% 60% at 100% 0%, hsl(190 70% 35% / 0.14) 0%, transparent 60%)',
          'radial-gradient(120% 80% at 50% 100%, hsl(220 60% 18% / 0.18) 0%, transparent 65%)',
          'linear-gradient(165deg, hsl(222 32% 12%) 0%, hsl(220 28% 9%) 55%, hsl(218 26% 6%) 100%)',
        ].join(', '),
        borderColor: 'hsl(220 50% 30% / 0.5)',
        boxShadow:
          'inset 0 1px 0 hsl(220 60% 85% / 0.07), inset 0 0 0 1px hsl(220 40% 50% / 0.05), 0 25px 60px -12px hsl(220 80% 4% / 0.7)',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          height: 4,
          background:
            'linear-gradient(90deg, hsl(220 90% 60%), hsl(190 80% 55%) 50%, hsl(150 70% 50%))',
        }}
      />

      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div>
          <div className="text-[10px] font-bold tracking-[0.22em] text-blue-300/80 uppercase">
            {isFifthLine ? (<>5<sup>TH</sup> | LINE</>) : (brandName || 'Status Report')}
          </div>
          <h3 className="text-xl font-semibold text-slate-50 mt-1">
            {deal.company} — Status Update
          </h3>
          <div className="text-xs text-slate-400 mt-0.5">{todayLong()}</div>
        </div>

        {/* Status Summary */}
        {content.sectionsVisible.statusSummary &&
          (content.statusSummaryHtml?.trim() || content.statusSummary.filter(Boolean).length > 0) && (
            <DarkSection label="Status Summary">
              <div
                className="prose prose-sm prose-invert max-w-none text-slate-200 [&_p]:my-1.5 [&_li]:my-0.5 leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html:
                    (content.statusSummaryHtml && content.statusSummaryHtml.trim()) ||
                    bulletsToNarrativeHtml(content.statusSummary.filter(Boolean)),
                }}
              />
            </DarkSection>
          )}

        {/* Pipeline Snapshot — shared component (same on the deal page) */}
        {content.sectionsVisible.pipelineSnapshot && onUpdateLender && (
          <div>
            <DarkLabel>Funding Source Pipeline Snapshot</DarkLabel>
            <LenderPipelineSnapshot
              lenders={(deal.lenders || []) as any}
              configuredStages={configuredStages}
              onUpdateLender={onUpdateLender}
              className="mt-2"
              hideDates
            />
          </div>
        )}

        {/* Recent Milestones */}
        {content.sectionsVisible.milestones && content.completedMilestones.filter(Boolean).length > 0 && (
          <DarkSection label="Recent Milestones">
            <ul className="m-0 p-0 list-none space-y-1.5">
              {content.completedMilestones.filter(Boolean).map((m, i) => (
                <li key={i} className="text-sm text-slate-200 leading-snug flex gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </DarkSection>
        )}

        {/* Next Steps */}
        {content.sectionsVisible.nextSteps && content.nextSteps.filter(Boolean).length > 0 && (
          <DarkSection label="Next Steps">
            <ul className="m-0 p-0 list-none space-y-1.5">
              {content.nextSteps.filter(Boolean).map((s, i) => (
                <li key={i} className="text-sm text-slate-200 leading-snug flex gap-2">
                  <span className="text-blue-400 font-bold">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </DarkSection>
        )}

        {/* Passed lender reasons */}
        {passedDetails.length > 0 && (
          <div className="passed-lender-reasons">
            <DarkLabel>Passed Lender Reasons</DarkLabel>
            <div className="mt-2 rounded-xl border border-slate-700/60 overflow-hidden print:overflow-visible">
              <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '62%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="text-left px-3 py-2 font-semibold">Funding Source</th>
                    <th className="text-left px-3 py-2 font-semibold">Key Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {passedDetails.map((p, i) => (
                    <tr key={i} className="border-t border-slate-700/50">
                      <td className="px-3 py-2 text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">{p.name}</td>
                      <td
                        className="px-3 py-2 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400/50 rounded-sm cursor-text"
                        style={{
                          fontStyle:
                            aiPassFeedbackLoading && !(p.name in aiPassFeedback) ? 'italic' : 'normal',
                        }}
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck
                        title="Click to edit key feedback"
                        onBlur={(e) => {
                          const next = (e.currentTarget.textContent || '').trim();
                          setAiPassFeedback((prev) => ({ ...prev, [p.name]: next }));
                        }}
                      >
                        {p.name in aiPassFeedback
                          ? aiPassFeedback[p.name] || '—'
                          : aiPassFeedbackLoading
                            ? 'Polishing…'
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* What We Need From You */}
        {content.sectionsVisible.actionItems && (
          <div>
            <DarkLabel>What We Need From You</DarkLabel>
            <div
              className="mt-2 rounded-xl px-4 py-3 text-sm text-slate-100 leading-relaxed whitespace-pre-wrap border-l-2 border-l-blue-400/80"
              style={{
                background:
                  'linear-gradient(180deg, hsl(220 35% 16% / 0.7) 0%, hsl(220 35% 12% / 0.7) 100%)',
                borderTop: '1px solid hsl(220 25% 25% / 0.5)',
                borderRight: '1px solid hsl(220 25% 25% / 0.5)',
                borderBottom: '1px solid hsl(220 25% 25% / 0.5)',
              }}
            >
              {content.actionItems.trim() || 'Nothing needed at this time!'}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-2xl rounded-2xl"
      >
        <DialogHeader className="px-6 pt-5 pb-2 shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <FileText className="h-5 w-5" />
            Status Report Preview
            {aiLoading && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-normal text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <Sparkles className="h-3.5 w-3.5" />
                Generating with AI…
              </span>
            )}
          </DialogTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review and edit before exporting. Toggle sections with the eye icon. Recent Milestones, Next Steps and Status Summary are AI-generated.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-100 dark:bg-slate-900">
          {/* Editor pane */}
          <div className="space-y-3">
            <SectionBlock title="Status Summary (AI)" visible={content.sectionsVisible.statusSummary} onToggle={() => toggleSection('statusSummary')}>
              <NarrativeEditor
                html={content.statusSummaryHtml || ''}
                placeholder="AI-generated executive summary narrative…"
                loading={aiLoading && !(content.statusSummaryHtml && content.statusSummaryHtml.trim())}
                onChange={(html) =>
                  setContent((p) => ({
                    ...p,
                    statusSummaryHtml: html,
                    statusSummary: htmlToBullets(html),
                  }))
                }
              />
            </SectionBlock>

            <SectionBlock title="Recent Milestones (AI)" visible={content.sectionsVisible.milestones} onToggle={() => toggleSection('milestones')}>
              <BulletEditor
                items={content.completedMilestones}
                placeholder="Milestone…"
                onUpdate={(i, v) => updateArrayItem('completedMilestones', i, v)}
                onRemove={(i) => removeArrayItem('completedMilestones', i)}
                onAdd={() => addArrayItem('completedMilestones')}
                loading={aiLoading && content.completedMilestones.length === 0}
              />
            </SectionBlock>

            <SectionBlock title="Next Steps (AI)" visible={content.sectionsVisible.nextSteps} onToggle={() => toggleSection('nextSteps')}>
              <BulletEditor
                items={content.nextSteps}
                placeholder="Next step…"
                onUpdate={(i, v) => updateArrayItem('nextSteps', i, v)}
                onRemove={(i) => removeArrayItem('nextSteps', i)}
                onAdd={() => addArrayItem('nextSteps')}
                loading={aiLoading && content.nextSteps.length === 0}
              />
            </SectionBlock>

            <SectionBlock title="What We Need From You" visible={content.sectionsVisible.actionItems} onToggle={() => toggleSection('actionItems')}>
              <Textarea
                value={content.actionItems}
                onChange={(e) => setContent((p) => ({ ...p, actionItems: e.target.value }))}
                className="text-sm min-h-[60px]"
              />
            </SectionBlock>

            <SectionBlock title="Pipeline Snapshot" visible={content.sectionsVisible.pipelineSnapshot} onToggle={() => toggleSection('pipelineSnapshot')}>
              <p className="text-xs text-muted-foreground">
                Auto-bucketed from lender stages (On Deck includes Sent DRL; In Review includes Active &amp; Lenders in Review; Passed pulls reasons from notes).
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <BucketCount label="On Deck" n={buckets.onDeck.length} />
                <BucketCount label="In Review" n={buckets.inReview.length} />
                <BucketCount label="Terms Issued" n={buckets.termsIssued.length} />
                <BucketCount label="Passed" n={buckets.passed.length} />
              </div>
            </SectionBlock>
          </div>

          {/* Live printable preview */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <div className="max-h-[80vh] overflow-y-auto">
              {isFifthLine ? renderInAppPreview() : (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                  {renderPrintable()}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-800 gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const snapshot = capturePrintableSnapshot();
              if (!snapshot) {
                toast({
                  title: 'Preview not ready',
                  description: 'The report preview is still loading. Try again in a moment.',
                  variant: 'destructive',
                });
                return;
              }
              printConfirmOpenRef.current = true;
              setShowPrintConfirm(true);
            }}
            disabled={isSavingCopy}
            className="gap-2"
          >
            {isSavingCopy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export as PDF
          </Button>
          {isFifthLine && (
            <Button variant="liquid-glass" size="sm" onClick={() => onExport(content)} className="gap-2">
              <Mail className="h-4 w-4" />
              Generate Status Email
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* A dedicated export tree stays mounted independently of both dialogs.
        Capturing the visible preview was inherently racy because Radix can
        detach it while the nested confirmation takes focus. */}
    <div
      aria-hidden="true"
      className="fixed left-[-100000px] top-0 w-[900px] pointer-events-none"
    >
      {isFifthLine
        ? renderInAppPreview(exportSourceRef, true)
        : renderPrintable(exportSourceRef, true)}
    </div>

    <AlertDialog
      open={showPrintConfirm}
      onOpenChange={(nextOpen) => {
        printConfirmOpenRef.current = nextOpen;
        setShowPrintConfirm(nextOpen);
        if (!nextOpen && !isSavingCopy) clearPrintableSnapshot();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Print this status update to PDF?</AlertDialogTitle>
          <AlertDialogDescription>
            The print dialog will open with the filename “{buildFileTitle()}”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
          <Checkbox
            checked={saveCopyToDealSpace}
            onCheckedChange={(v) => setSaveCopyToDealSpace(v === true)}
            className="mt-0.5"
          />
          <span>
            Save a copy to Deal Space ▸ Documents
            <span className="block text-xs text-muted-foreground">
              Archives the same report as a PDF on this deal.
            </span>
          </span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={clearPrintableSnapshot}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmPrint}>Print to PDF</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Inline style helpers (kept inline so the printable HTML is self-contained) ──
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.14em',
  textTransform: 'uppercase', margin: '24px 0 8px',
};
const listStyle: React.CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };
const listItemStyle: React.CSSProperties = { fontSize: 14, color: '#334155', lineHeight: 1.55, marginBottom: 5 };
const glyphStyle: React.CSSProperties = { display: 'inline-block', width: 18, color: '#1e3a8a', fontWeight: 700 };
const thStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'left', verticalAlign: 'top',
  background: '#f8fafc', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569',
};
const tdStyle: React.CSSProperties = { border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'left', verticalAlign: 'top' };
const actionStyle: React.CSSProperties = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '3px solid #1e3a8a',
  borderRadius: 6, padding: '12px 14px', fontSize: 14, color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-wrap',
};
function colStyle(color: string, theme?: { pipeline: Record<string, { bg: string; border: string; head: string }> }): React.CSSProperties {
  const fallback = {
    blue:  { bg: 'linear-gradient(180deg,#eff6ff 0%,#ffffff 60%)', border: '#bfdbfe', head: '' },
    teal:  { bg: 'linear-gradient(180deg,#ecfeff 0%,#ffffff 60%)', border: '#a5f3fc', head: '' },
    green: { bg: 'linear-gradient(180deg,#f0fdf4 0%,#ffffff 60%)', border: '#bbf7d0', head: '' },
    red:   { bg: 'linear-gradient(180deg,#fef2f2 0%,#ffffff 60%)', border: '#fecaca', head: '' },
  };
  const tints = theme?.pipeline || fallback;
  const t = tints[color] || tints.blue;
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    overflow: 'hidden',
    background: t.bg,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 170,
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  };
}
function colHeadStyle(color: string, theme?: { pipeline: Record<string, { head: string }> }): React.CSSProperties {
  const fallback: Record<string, string> = {
    blue:  'linear-gradient(135deg,#3b82f6,#2563eb)',
    teal:  'linear-gradient(135deg,#0ea5e9,#0d9488)',
    green: 'linear-gradient(135deg,#22c55e,#16a34a)',
    red:   'linear-gradient(135deg,#ef4444,#dc2626)',
  };
  const map: Record<string, string> = theme
    ? Object.fromEntries(Object.entries(theme.pipeline).map(([k, v]) => [k, v.head]))
    : fallback;
  return {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#fff', background: map[color] || map.blue,
  };
}

function SectionBlock({
  title, visible, onToggle, children,
}: { title: string; visible: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border border-border bg-background/60 p-3 ${!visible ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
          {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>
      {visible && children}
    </div>
  );
}

function BulletEditor({
  items, placeholder, onUpdate, onRemove, onAdd, loading,
}: {
  items: string[];
  placeholder?: string;
  onUpdate: (i: number, v: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  loading?: boolean;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Generating with AI…
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={it} onChange={(e) => onUpdate(i, e.target.value)} className="text-sm" placeholder={placeholder} />
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => onRemove(i)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={onAdd} className="gap-1">
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  );
}

function NarrativeEditor({
  html, onChange, placeholder, loading,
}: {
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
  loading?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: html || '',
    editorProps: {
      attributes: {
        class:
          'tiptap prose prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2 text-sm leading-relaxed',
        'data-placeholder': placeholder || '',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external html (e.g. AI generation) into the editor without nuking caret on user typing.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (html && html !== current) {
      editor.commands.setContent(html);
    }
  }, [html, editor]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Generating narrative summary with AI…
      </div>
    );
  }

  if (!editor) return null;

  const btn = (active: boolean) =>
    `h-7 w-7 inline-flex items-center justify-center rounded-md border text-xs transition ${
      active
        ? 'bg-primary/15 border-primary/40 text-primary'
        : 'bg-background/60 border-border text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="rounded-md border border-border bg-background/40 overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30">
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function BucketCount({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5 flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{n}</span>
    </div>
  );
}

// ── Dark in-app preview helpers ────────────────────────────────────────────
function DarkLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-base font-bold tracking-[0.14em] uppercase text-white">
      {children}
    </div>
  );
}

function DarkSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <DarkLabel>{label}</DarkLabel>
      <div
        className="mt-2 rounded-xl px-4 py-3 border-l-2 border-l-blue-400/70"
        style={{
          backgroundColor: 'hsl(220 28% 12% / 0.55)',
          backgroundImage: [
            'radial-gradient(80% 100% at 0% 0%, hsl(220 70% 35% / 0.14) 0%, transparent 60%)',
            'linear-gradient(180deg, hsl(220 30% 16% / 0.55) 0%, hsl(220 30% 10% / 0.55) 100%)',
          ].join(', '),
          borderTop: '1px solid hsl(220 40% 30% / 0.45)',
          borderRight: '1px solid hsl(220 40% 30% / 0.45)',
          borderBottom: '1px solid hsl(220 40% 30% / 0.45)',
          boxShadow: 'inset 0 1px 0 hsl(220 60% 80% / 0.05)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function darkColStyle(color: 'blue' | 'teal' | 'green' | 'red'): React.CSSProperties {
  const tints: Record<string, { bg: string; border: string }> = {
    blue: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(220 75% 35% / 0.32) 0%, transparent 60%), linear-gradient(180deg, hsl(220 45% 16% / 0.9) 0%, hsl(220 40% 9% / 0.95) 100%)',
      border: 'hsl(220 75% 55% / 0.4)',
    },
    teal: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(190 75% 35% / 0.3) 0%, transparent 60%), linear-gradient(180deg, hsl(190 50% 15% / 0.9) 0%, hsl(190 45% 9% / 0.95) 100%)',
      border: 'hsl(185 75% 50% / 0.4)',
    },
    green: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(150 70% 35% / 0.3) 0%, transparent 60%), linear-gradient(180deg, hsl(150 42% 14% / 0.9) 0%, hsl(150 42% 8% / 0.95) 100%)',
      border: 'hsl(150 65% 45% / 0.4)',
    },
    red: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(0 75% 38% / 0.3) 0%, transparent 60%), linear-gradient(180deg, hsl(0 48% 16% / 0.9) 0%, hsl(0 42% 9% / 0.95) 100%)',
      border: 'hsl(0 70% 55% / 0.4)',
    },
  };
  const t = tints[color];
  return {
    background: t.bg,
    borderColor: t.border,
    boxShadow:
      'inset 0 1px 0 hsl(220 60% 85% / 0.08), inset 0 0 0 1px hsl(220 40% 50% / 0.04), 0 6px 20px hsl(220 60% 4% / 0.45)',
  };
}

function darkColHeadStyle(color: 'blue' | 'teal' | 'green' | 'red'): React.CSSProperties {
  const map: Record<string, string> = {
    blue: 'linear-gradient(135deg, hsl(220 85% 55%), hsl(215 90% 45%))',
    teal: 'linear-gradient(135deg, hsl(190 80% 50%), hsl(175 75% 38%))',
    green: 'linear-gradient(135deg, hsl(150 75% 45%), hsl(155 70% 35%))',
    red: 'linear-gradient(135deg, hsl(0 75% 55%), hsl(355 75% 45%))',
  };
  return { background: map[color] };
}