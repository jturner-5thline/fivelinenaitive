import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FileText, Mail, Plus, X, Eye, EyeOff, Loader2, Sparkles, Download } from 'lucide-react';
import { Deal } from '@/types/deal';
import type { StatusReportEditableContent, LenderStageConfig, OutstandingItem } from '@/utils/dealExport';
import { bucketLenders, extractPassDetails } from '@/lib/lenderStatusBuckets';
import { sendClaudeMessage } from '@/services/claude';
import { rewritePassedFeedback } from '@/lib/rewritePassFeedback';
import { toast } from '@/hooks/use-toast';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { LenderStageManageDialog } from './LenderStageManageDialog';
import type { DealLender } from '@/types/deal';

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
   * Persist a lender update to the underlying deal. Required for the
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
  const initialContent = useMemo(
    () => buildInitialContent(deal, configuredStages, outstandingItems),
    [deal, configuredStages, outstandingItems],
  );

  const [content, setContent] = useState<StatusReportEditableContent>(initialContent);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTriedForDeal, setAiTriedForDeal] = useState<string | null>(null);
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

  // Pipeline-snapshot management dialog state. `null` = closed.
  const [manageBucket, setManageBucket] = useState<null | 'onDeck' | 'inReview' | 'termsIssued' | 'passed'>(null);
  const bucketMeta = {
    onDeck:      { label: 'On Deck',       color: 'blue'  as const, items: buckets.onDeck },
    inReview:    { label: 'In Review',     color: 'teal'  as const, items: buckets.inReview },
    termsIssued: { label: 'Terms Issued',  color: 'green' as const, items: buckets.termsIssued },
    passed:      { label: 'Passed',        color: 'red'   as const, items: buckets.passed },
  };

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

    const lenders = deal.lenders || [];
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

  // ── PDF export via window.print() scoped to the report ──────────────────
  const printableRef = useRef<HTMLDivElement | null>(null);
  const handlePrintPdf = () => {
    const node = printableRef.current;
    if (!node) return;
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) {
      toast({
        title: 'Popup blocked',
        description: 'Allow popups to download the PDF.',
        variant: 'destructive',
      });
      return;
    }
    const styles = `
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;}
      .sr-page{max-width:780px;margin:0 auto;padding:32px 36px;}
      .sr-bar{height:6px;background:#1e3a8a;border-radius:2px;margin-bottom:16px;}
      .sr-brand{font-size:11px;font-weight:700;letter-spacing:.18em;color:#1e3a8a;}
      .sr-title{font-size:22px;font-weight:600;margin:4px 0 0 0;color:#0f172a;}
      .sr-date{font-size:13px;color:#64748b;margin-top:2px;}
      .sr-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
      .sr-badge.green{background:#dcfce7;color:#166534;}
      .sr-badge.yellow{background:#fef9c3;color:#854d0e;}
      .sr-badge.red{background:#fee2e2;color:#991b1b;}
      .sr-badge.gray{background:#e2e8f0;color:#334155;}
      .sr-section-label{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.14em;text-transform:uppercase;margin:24px 0 8px;}
      .sr-summary{border-left:3px solid #1e3a8a;padding:10px 0 10px 16px;margin:0;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border-radius:6px;}
      .sr-summary p{font-size:14px;color:#334155;line-height:1.7;margin:0 0 8px 0;}
      .sr-summary p:last-child{margin-bottom:0;}
      .sr-summary ul,.sr-summary ol{margin:6px 0 6px 22px;padding:0;}
      .sr-summary li{font-size:14px;color:#334155;line-height:1.6;margin-bottom:4px;}
      .sr-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:8px;align-items:stretch;}
      .sr-col{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-height:170px;box-shadow:0 1px 2px rgba(15,23,42,0.04);}
      .sr-col-head{padding:10px 12px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;}
      .sr-col-body{padding:10px 12px;flex:1;}
      .sr-col-body p{margin:0 0 4px 0;font-size:12px;color:#334155;line-height:1.45;}
      .sr-col.blue{background:linear-gradient(180deg,#eff6ff 0%,#ffffff 60%);border-color:#bfdbfe;}
      .sr-col.blue .sr-col-head{background:linear-gradient(135deg,#3b82f6,#2563eb);}
      .sr-col.teal{background:linear-gradient(180deg,#ecfeff 0%,#ffffff 60%);border-color:#a5f3fc;}
      .sr-col.teal .sr-col-head{background:linear-gradient(135deg,#0ea5e9,#0d9488);}
      .sr-col.green{background:linear-gradient(180deg,#f0fdf4 0%,#ffffff 60%);border-color:#bbf7d0;}
      .sr-col.green .sr-col-head{background:linear-gradient(135deg,#22c55e,#16a34a);}
      .sr-col.red{background:linear-gradient(180deg,#fef2f2 0%,#ffffff 60%);border-color:#fecaca;}
      .sr-col.red .sr-col-head{background:linear-gradient(135deg,#ef4444,#dc2626);}
      .sr-list{margin:0;padding:0;list-style:none;}
      .sr-list li{font-size:14px;color:#334155;line-height:1.55;margin-bottom:5px;}
      .sr-list .glyph{display:inline-block;width:18px;color:#1e3a8a;font-weight:700;}
      table.sr-passed{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;}
      table.sr-passed th,table.sr-passed td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;vertical-align:top;}
      table.sr-passed th{background:#f8fafc;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#475569;}
      .sr-action{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #1e3a8a;border-radius:6px;padding:12px 14px;font-size:14px;color:#0f172a;line-height:1.6;white-space:pre-wrap;}
      @page { size: Letter; margin: 0.5in; }
    `;
    win.document.write(
      `<!doctype html><html><head><title>${deal.company} — Status Report</title><style>${styles}</style></head><body><div class="sr-page">${node.innerHTML}</div></body></html>`,
    );
    win.document.close();
    // Give the new window a tick to layout before printing.
    setTimeout(() => {
      win.focus();
      win.print();
    }, 200);
  };

  // ── Render the printable report (light-themed) ──────────────────────────
  const renderPrintable = () => (
    <div ref={printableRef} className="bg-white text-slate-900 rounded-lg overflow-hidden">
      <div className="sr-bar" style={{ height: 6, background: '#1e3a8a', borderRadius: 2, marginBottom: 16 }} />
      <div>
        <div className="sr-brand" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#1e3a8a' }}>
          5<sup>TH</sup> | LINE
        </div>
        <h2 className="sr-title" style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 0', color: '#0f172a' }}>
          {deal.company} — Status Update
        </h2>
        <div className="sr-date" style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{todayLong()}</div>
      </div>

      {content.sectionsVisible.statusSummary && (content.statusSummaryHtml?.trim() || content.statusSummary.filter(Boolean).length > 0) && (
        <>
          <div className="sr-section-label" style={sectionLabelStyle}>Status Summary</div>
          <div
            className="sr-summary"
            style={{
              borderLeft: '3px solid #1e3a8a',
              padding: '10px 0 10px 16px',
              margin: 0,
              background: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)',
              borderRadius: 6,
              color: '#334155',
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
          <div className="sr-section-label" style={sectionLabelStyle}>Lender Pipeline Snapshot</div>
          <div className="sr-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 8, alignItems: 'stretch' }}>
            {([
              { key: 'onDeck', label: 'On Deck', color: 'blue', items: buckets.onDeck },
              { key: 'inReview', label: 'In Review', color: 'teal', items: buckets.inReview },
              { key: 'termsIssued', label: 'Terms Issued', color: 'green', items: buckets.termsIssued },
              { key: 'passed', label: 'Passed', color: 'red', items: buckets.passed },
            ] as const).map((g) => (
              <div key={g.key} className={`sr-col ${g.color}`} style={colStyle(g.color)}>
                <div className="sr-col-head" style={colHeadStyle(g.color)}>{g.label} ({g.items.length})</div>
                <div className="sr-col-body" style={{ padding: '10px 12px', flex: 1 }}>
                  {g.items.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>None</p>
                  ) : (
                    g.items.map((l) => (
                      <p key={l.id} style={{ margin: '0 0 4px', fontSize: 12, color: '#334155', lineHeight: 1.45 }}>{l.name}</p>
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
          <div className="sr-section-label" style={sectionLabelStyle}>Recent Milestones</div>
          <ul className="sr-list" style={listStyle}>
            {content.completedMilestones.filter(Boolean).map((m, i) => (
              <li key={i} style={listItemStyle}>
                <span className="glyph" style={glyphStyle}>✓</span>{m}
              </li>
            ))}
          </ul>
        </>
      )}

      {content.sectionsVisible.nextSteps && content.nextSteps.filter(Boolean).length > 0 && (
        <>
          <div className="sr-section-label" style={sectionLabelStyle}>Next Steps</div>
          <ul className="sr-list" style={listStyle}>
            {content.nextSteps.filter(Boolean).map((s, i) => (
              <li key={i} style={listItemStyle}>
                <span className="glyph" style={glyphStyle}>→</span>{s}
              </li>
            ))}
          </ul>
        </>
      )}

      {passedDetails.length > 0 && (
        <>
          <div className="sr-section-label" style={sectionLabelStyle}>Passed Lender Reasons</div>
          <table className="sr-passed" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Lender</th>
                <th style={thStyle}>Primary Reason</th>
                <th style={thStyle}>Key Feedback</th>
              </tr>
            </thead>
            <tbody>
              {passedDetails.map((p, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{p.name}</td>
                  <td style={tdStyle}>{p.reason}</td>
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
          <div className="sr-section-label" style={sectionLabelStyle}>What We Need From You</div>
          <div className="sr-action" style={actionStyle}>
            {content.actionItems.trim() || 'Nothing needed at this time!'}
          </div>
        </>
      )}
    </div>
  );

  return (
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
            <div className="rounded-lg bg-white border border-slate-300 shadow-lg p-6 max-h-[80vh] overflow-y-auto">
              {renderPrintable()}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-800 gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button variant="outline" size="sm" onClick={handlePrintPdf} className="gap-2">
            <Download className="h-4 w-4" />
            Export as PDF
          </Button>
          <Button variant="liquid-glass" size="sm" onClick={() => onExport(content)} className="gap-2">
            <Mail className="h-4 w-4" />
            Generate Status Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
function colStyle(color: string): React.CSSProperties {
  const tints: Record<string, { bg: string; border: string }> = {
    blue:  { bg: 'linear-gradient(180deg,#eff6ff 0%,#ffffff 60%)', border: '#bfdbfe' },
    teal:  { bg: 'linear-gradient(180deg,#ecfeff 0%,#ffffff 60%)', border: '#a5f3fc' },
    green: { bg: 'linear-gradient(180deg,#f0fdf4 0%,#ffffff 60%)', border: '#bbf7d0' },
    red:   { bg: 'linear-gradient(180deg,#fef2f2 0%,#ffffff 60%)', border: '#fecaca' },
  };
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
function colHeadStyle(color: string): React.CSSProperties {
  const map: Record<string, string> = {
    blue:  'linear-gradient(135deg,#3b82f6,#2563eb)',
    teal:  'linear-gradient(135deg,#0ea5e9,#0d9488)',
    green: 'linear-gradient(135deg,#22c55e,#16a34a)',
    red:   'linear-gradient(135deg,#ef4444,#dc2626)',
  };
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