import { useState, useCallback, useRef, useEffect, useMemo, TouchEvent } from 'react';
import { Save as SaveIcon, Check, Send, Loader2 } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ManagementReviewDashboard } from './ManagementReviewDashboard';
import { BenchmarkForecastsPage } from './BenchmarkForecastsPage';
import { KeyMetricsPage } from './KeyMetricsPage';
import { InsightsReportingBar } from './InsightsReportingBar';
import { AgendaEditor } from '@/components/insights/AgendaEditor';
import {
  QuarterlyReportPrintStyles,
  QuarterlyInsightsReportPage,
  useQuarterlyReportState,
} from './QuarterlyInsightsReport';
import { useCompanyDashboardConfig } from '@/hooks/useCompanyDashboardConfig';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { InsightsUserCommentsDropdown } from '@/components/insights/comments/InsightsUserCommentsDropdown';
import { InsightsContextualSurface } from '@/components/insights/InsightsContextualSurface';

type ReportSelection = {
  period: 'monthly' | 'quarterly';
  quarter: string;
  month: string;
};

const DEFAULT_SELECTION: ReportSelection = {
  period: 'quarterly',
  quarter: 'Q1 2026',
  month: 'January 2026',
};

function periodSlug(sel: ReportSelection): string {
  const label = sel.period === 'monthly' ? sel.month : sel.quarter;
  return `${sel.period}:${(label || 'unknown').replace(/\s+/g, '-').toLowerCase()}`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Derive the per-tab report selection from the GLOBAL Insights reporting
 *  period header (Month / Quarter + period dropdown). This is the single
 *  source of truth for which (tab × period_type × period_value) record we
 *  load and save. */
function useSelectionFromGlobalPeriod(): { selection: ReportSelection; ready: boolean } {
  const tf = useInsightsTimeframeOptional();
  const rp = tf?.reportingPeriod ?? null;
  return useMemo(() => {
    if (!rp) return { selection: DEFAULT_SELECTION, ready: true };
    if (rp.view === 'month') {
      const m = /^(\d{4})-(\d{2})$/.exec(rp.period);
      if (!m) return { selection: DEFAULT_SELECTION, ready: true };
      const year = parseInt(m[1], 10);
      const mi = parseInt(m[2], 10);
      const monthLabel = `${MONTH_NAMES[mi - 1]} ${year}`;
      const q = Math.floor((mi - 1) / 3) + 1;
      return { selection: { period: 'monthly', quarter: `Q${q} ${year}`, month: monthLabel }, ready: true };
    }
    const m = /^(\d{4})-Q([1-4])$/.exec(rp.period);
    if (!m) return { selection: DEFAULT_SELECTION, ready: true };
    const year = parseInt(m[1], 10);
    const q = parseInt(m[2], 10);
    return { selection: { period: 'quarterly', quarter: `Q${q} ${year}`, month: `${MONTH_NAMES[(q - 1) * 3]} ${year}` }, ready: true };
  }, [rp?.view, rp?.period]);
}

function QuarterlyReportSlot({ reportKey, defaultAuthor, persona, onSaveReady }: { reportKey: string; defaultAuthor: string; persona: string; onSaveReady?: (save: (() => Promise<boolean>) | null, canEdit: boolean, hasUnsavedChanges: boolean) => void }) {
  // The active period is derived from the GLOBAL Insights reporting period
  // header (Month / Quarter + period dropdown). The composite key
  // `qir:<reportKey>:<period_type>:<period_value>` uniquely identifies each
  // (tab × period_type × period_value) record — saving one period NEVER
  // affects another.
  const { selection, ready: selectionLoaded } = useSelectionFromGlobalPeriod();

  const initial = useMemo(
    () => ({
      authors: [defaultAuthor],
      period: selection.period,
      quarter: selection.quarter,
      month: selection.month,
      // Each (tab × period) is its own independent report. Do NOT pre-fill
      // seed defaults for goals/initiatives/risks/kpis — those come from
      // the saved blob for this exact composite key, or remain empty
      // until the user fills them in for THIS specific period. Without
      // this, adjacent months (e.g. Mar 2026 vs Apr 2026) show identical
      // seed values and look like duplicate reports.
      goals: [],
      initiatives: [],
      risks: [],
      kpis: [],
    } as any),
    [defaultAuthor, selection.period, selection.quarter, selection.month],
  );

  const dataKey = `qir:${reportKey}:${periodSlug(selection)}`;

  const { state, setState, reset, save, print, canEdit, isDirty, isSaving, activeCompositeKey, fetchedCompositeKey, unsavedChangesWarning } = useQuarterlyReportState(
    initial,
    dataKey,
    // No onSelectionChange: the period is owned by the global header, not
    // mutated from inside the report editor.
  );

  useEffect(() => {
    onSaveReady?.(save || null, canEdit !== false, isDirty);
    return () => onSaveReady?.(null, false, false);
  }, [save, canEdit, isDirty, onSaveReady]);

  if (!selectionLoaded) return null;

  return (
    <>
      <QuarterlyInsightsReportPage
        s={state}
        set={setState}
        reset={reset}
        print={print}
        save={save}
        canEdit={canEdit}
        reportKey={reportKey}
        titlePrefix={persona}
        ownerName={defaultAuthor}
        activeCompositeKey={activeCompositeKey}
        fetchedCompositeKey={fetchedCompositeKey}
        isDirty={isDirty}
        isSaving={isSaving}
        unsavedChangesWarning={unsavedChangesWarning}
      />
    </>
  );
}

export function ManagementReviewCarousel({ isEditMode = false, onExitEditMode }: { isEditMode?: boolean; onExitEditMode?: () => void } = {}) {
  // Default to the Dashboard tab (index 1); Agenda (index 0) is opt-in.
  const [activeIndex, setActiveIndex] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const [reportSave, setReportSave] = useState<{ fn: (() => Promise<boolean>) | null; canEdit: boolean; hasUnsavedChanges: boolean }>({ fn: null, canEdit: false, hasUnsavedChanges: false });
  const [justSaved, setJustSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Always-current save fn lives in a ref so updates don't re-render
  // (the child's `save` callback gets a new identity every render).
  const saveFnRef = useRef<(() => Promise<boolean>) | null>(null);
  const handleSaveReady = useCallback((fn: (() => Promise<boolean>) | null, canEdit: boolean, hasUnsavedChanges: boolean) => {
    saveFnRef.current = fn;
    // Dedupe to prevent an infinite render loop: the child's `save`
    // callback gets a new identity on each render, so blindly calling
    // setReportSave({...}) re-renders the parent, re-renders the child,
    // which produces another new `save` ref, ad infinitum. Only update
    // when meaningful values actually change.
    setReportSave(prev => {
      if (
        prev.canEdit === canEdit &&
        prev.hasUnsavedChanges === hasUnsavedChanges &&
        // Treat presence of a save fn as the only meaningful change for fn,
        // not its referential identity.
        !!prev.fn === !!fn
      ) {
        return prev;
      }
      return { fn, canEdit, hasUnsavedChanges };
    });
  }, []);
  const handleSaveClick = async () => {
    const fn = saveFnRef.current;
    if (!fn) return;
    const saved = await fn();
    if (!saved) return;
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  // Per-report-tab metadata used by the Submit-for-review email.
  // Index aligns with PAGES order (4=JT, 5=JM, 6=SW).
  const REPORT_TAB_META: Record<number, { tabSlug: 'jt' | 'jm' | 'sw'; ownerName: string; ownerEmail: string }> = {
    4: { tabSlug: 'jt', ownerName: 'James Turner',   ownerEmail: 'jturner@5thline.co' },
    5: { tabSlug: 'jm', ownerName: 'John Moffitt',   ownerEmail: 'jmoffitt@5thline.co' },
    6: { tabSlug: 'sw', ownerName: 'Scott Williams', ownerEmail: 'swilliams@5thline.co' },
  };
  const REVIEW_RECIPIENTS = [
    'mclark@5thline.co',
    'jturner@5thline.co',
    'jmoffitt@5thline.co',
    'swilliams@5thline.co',
  ];

  const handleSubmitForReview = async () => {
    const meta = REPORT_TAB_META[activeIndex];
    if (!meta || submitting) return;
    setSubmitting(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fivelinenaitive.lovable.app';
      const url = `${origin}/insights?tab=${meta.tabSlug}`;
      const stamp = Date.now();
      // Fan-out: one send per recipient (the send-transactional-email function
      // takes a single recipient). Fire in parallel and require all to succeed.
      const results = await Promise.all(
        REVIEW_RECIPIENTS.map((recipient) =>
          supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'insights-report-ready',
              recipientEmail: recipient,
              idempotencyKey: `insights-report-ready-${meta.tabSlug}-${stamp}-${recipient}`,
              templateData: { ownerName: meta.ownerName, url },
            },
          }),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      sonnerToast.success('Report submitted — review email sent');
    } catch (err) {
      console.error('Failed to submit insights report for review', err);
      sonnerToast.error('Could not send review email. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const attemptSetActiveIndex = useCallback((nextIndex: number | ((prev: number) => number)) => {
    if (reportSave.hasUnsavedChanges) {
      sonnerToast.error('You have unsaved changes. Save the report before leaving this tab.');
      return;
    }
    setActiveIndex(nextIndex);
  }, [reportSave.hasUnsavedChanges]);

  const PAGE_META: { title: string; tabLabel: string }[] = [
    { title: 'Agenda',                               tabLabel: 'Agenda'      },
    { title: 'Insights Dashboard',                   tabLabel: 'Dashboard'   },
    { title: 'Benchmark Forecasts',                  tabLabel: 'Forecasts'   },
    { title: 'Key Metrics',                          tabLabel: 'Key Metrics' },
    { title: 'Quarterly Insights Report — JT',       tabLabel: 'JT'          },
    { title: 'Quarterly Insights Report — JM',       tabLabel: 'JM'          },
    { title: 'Quarterly Insights Report — SW',       tabLabel: 'SW'          },
  ];

  const tabsBar = (
    <div
      role="tablist"
      aria-label="Insights sections"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: 4,
        background: 'rgba(16,28,52,0.55)',
        border: '0.5px solid rgba(80,140,255,0.18)',
        borderRadius: 999,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {PAGE_META.map((p, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={p.title}
            role="tab"
            aria-selected={active}
            onClick={() => attemptSetActiveIndex(i)}
            style={{
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              letterSpacing: '0.03em',
              padding: '6px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              color: active ? '#0a2540' : 'rgba(200,225,255,0.72)',
              background: active
                ? 'linear-gradient(180deg, #9bdcff, #4db8ff)'
                : 'transparent',
              boxShadow: active ? '0 2px 8px rgba(77,184,255,0.35)' : 'none',
              transition: 'background .15s, color .15s',
            }}
          >
            {p.tabLabel}
          </button>
        );
      })}
    </div>
  );

  const tabsBarWithActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {tabsBar}
      <InsightsUserCommentsDropdown onNavigateTab={(i) => attemptSetActiveIndex(i)} />
    </div>
  );

  const PAGES: { title: string; tabLabel: string; render: () => JSX.Element }[] = [
    { title: 'Agenda',                               tabLabel: 'Agenda',     render: () => (
      <InsightsContextualSurface reportKey="insights:agenda" reportLabel="Agenda" sectionIdPrefix="agenda-section-" fallbackSourceLabel="Agenda">
        <AgendaEditor />
      </InsightsContextualSurface>
    ) },
    { title: 'Insights Dashboard',                   tabLabel: 'Dashboard',  render: () => (
      <InsightsContextualSurface reportKey="insights:dashboard" reportLabel="Insights Dashboard" sectionIdPrefix="dashboard-section-" fallbackSourceLabel="Insights Dashboard">
        <ManagementReviewDashboard isEditMode={isEditMode} onExitEditMode={onExitEditMode} />
      </InsightsContextualSurface>
    ) },
    { title: 'Benchmark Forecasts',                  tabLabel: 'Forecasts',  render: () => (
      <InsightsContextualSurface reportKey="insights:forecasts" reportLabel="Benchmark Forecasts" sectionIdPrefix="forecasts-section-" fallbackSourceLabel="Forecasts">
        <BenchmarkForecastsPage isEditMode={isEditMode} />
      </InsightsContextualSurface>
    ) },
    { title: 'Key Metrics',                          tabLabel: 'Key Metrics',render: () => (
      <InsightsContextualSurface reportKey="insights:key-metrics" reportLabel="Key Metrics" sectionIdPrefix="keymetrics-section-" fallbackSourceLabel="Key Metrics">
        <KeyMetricsPage isEditMode={isEditMode} />
      </InsightsContextualSurface>
    ) },
    { title: 'Quarterly Insights Report — JT', tabLabel: 'JT', render: () => <QuarterlyReportSlot key="qir-slot-JT" reportKey="report-1" defaultAuthor="James Turner"   persona="JT" onSaveReady={handleSaveReady} /> },
    { title: 'Quarterly Insights Report — JM', tabLabel: 'JM', render: () => <QuarterlyReportSlot key="qir-slot-JM" reportKey="report-2" defaultAuthor="John Moffitt"   persona="JM" onSaveReady={handleSaveReady} /> },
    { title: 'Quarterly Insights Report — SW', tabLabel: 'SW', render: () => <QuarterlyReportSlot key="qir-slot-SW" reportKey="report-3" defaultAuthor="Scott Williams" persona="SW" onSaveReady={handleSaveReady} /> },
  ];

  const goTo = useCallback((dir: -1 | 1) => {
    attemptSetActiveIndex(prev => (prev + dir + PAGES.length) % PAGES.length);
  }, [PAGES.length, attemptSetActiveIndex]);

  // Keyboard left/right navigation (skip when typing in inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') goTo(-1);
      else if (e.key === 'ArrowRight') goTo(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goTo]);

  const onTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) goTo(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const activePage = PAGES[activeIndex];
  const isReportTab = activeIndex >= 4;

  return (
    <div
      style={{ position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Unified reporting bar with tabs on every Insights tab */}
      <InsightsReportingBar tabsSlot={tabsBarWithActions} />
      {isReportTab && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, margin: '0 auto 12px', maxWidth: 1200, padding: '0 16px', flexWrap: 'wrap' }}>
          <button
            type="button"
              onClick={() => { void handleSaveClick(); }}
            disabled={!reportSave.fn || !reportSave.canEdit}
            title={reportSave.canEdit ? 'Save report' : 'You do not have permission to save'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: '6px 14px',
              borderRadius: 999,
              border: '0.5px solid rgba(80,140,255,0.18)',
              cursor: reportSave.fn && reportSave.canEdit ? 'pointer' : 'not-allowed',
              color: justSaved ? '#0a2540' : 'rgba(200,225,255,0.92)',
              background: justSaved
                ? 'linear-gradient(180deg, #7ed0ff, #4db8ff)'
                : 'rgba(16,28,52,0.55)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              opacity: reportSave.fn && reportSave.canEdit ? 1 : 0.5,
              transition: 'background .15s, color .15s',
            }}
          >
            {justSaved ? <Check size={12} /> : <SaveIcon size={12} />}
              {justSaved ? 'Saved' : reportSave.hasUnsavedChanges ? 'Save changes' : 'Save'}
          </button>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <QuarterlyReportPrintStyles />
        {activePage.render()}
      </div>
    </div>
  );
}
