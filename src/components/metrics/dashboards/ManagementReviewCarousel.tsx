import { useState, useCallback, useRef, useEffect, useMemo, TouchEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save as SaveIcon, Check, Send, Loader2, Lock, Unlock, Eye, X as XIcon } from 'lucide-react';
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
import { useInsightsReportSubmission } from '@/hooks/useInsightsReportSubmission';

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

function QuarterlyReportSlot({ reportKey, defaultAuthor, persona, onSaveReady, locked = false, lockBanner }: { reportKey: string; defaultAuthor: string; persona: string; onSaveReady?: (save: (() => Promise<boolean>) | null, canEdit: boolean, hasUnsavedChanges: boolean, getSnapshot: () => any) => void; locked?: boolean; lockBanner?: JSX.Element | null }) {
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
    // NOTE: KPI selection is intentionally scoped to the active reporting
    // period (composite dataKey). We do NOT pass a sharedKpiKey, so
    // switching months/quarters loads that period's own KPI selection
    // (or an empty state if none has been saved) — prior-period KPIs
    // never bleed forward.
  );

  // When the report is submitted/locked, neutralize edit/save: callers
  // get a no-op save and canEdit=false so the carousel Save button hides.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const getSnapshot = useCallback(() => stateRef.current, []);
  useEffect(() => {
    if (locked) {
      onSaveReady?.(null, false, false, getSnapshot);
    } else {
      onSaveReady?.(save || null, canEdit !== false, isDirty, getSnapshot);
    }
    return () => onSaveReady?.(null, false, false, getSnapshot);
  }, [save, canEdit, isDirty, onSaveReady, locked, getSnapshot]);

  const noopSave = useCallback(async () => true, []);

  if (!selectionLoaded) return null;

  const effectiveCanEdit = locked ? false : canEdit;

  return (
    <>
      {lockBanner}
      <div
        style={locked ? { pointerEvents: 'none', opacity: 0.85, filter: 'saturate(0.85)' } : undefined}
        aria-disabled={locked || undefined}
      >
      <QuarterlyInsightsReportPage
        s={state}
        set={setState}
        reset={reset}
        print={print}
        save={locked ? noopSave : save}
        canEdit={effectiveCanEdit}
        reportKey={reportKey}
        titlePrefix={persona}
        ownerName={defaultAuthor}
        activeCompositeKey={activeCompositeKey}
        fetchedCompositeKey={fetchedCompositeKey}
        isDirty={isDirty}
        isSaving={isSaving}
        unsavedChangesWarning={unsavedChangesWarning}
      />
      </div>
    </>
  );
}

export function ManagementReviewCarousel({ isEditMode = false, onExitEditMode }: { isEditMode?: boolean; onExitEditMode?: () => void } = {}) {
  // Default to the Dashboard tab (index 1); Agenda (index 0) is opt-in.
  const [activeIndex, setActiveIndex] = useState(1);
  const [searchParams] = useSearchParams();
  // Deep-link: /insights?tab=jt|jm|sw|agenda|dashboard|forecasts|key-metrics
  // opens the matching carousel tab (used by the Submit-for-review email CTA).
  useEffect(() => {
    const slug = (searchParams.get('tab') || '').toLowerCase();
    const map: Record<string, number> = {
      agenda: 0,
      dashboard: 1,
      forecasts: 2,
      'key-metrics': 3,
      keymetrics: 3,
      jt: 4,
      jm: 5,
      sw: 6,
    };
    if (slug in map) setActiveIndex(map[slug]);
  }, [searchParams]);
  const touchStartX = useRef<number | null>(null);
  const [reportSave, setReportSave] = useState<{ fn: (() => Promise<boolean>) | null; canEdit: boolean; hasUnsavedChanges: boolean }>({ fn: null, canEdit: false, hasUnsavedChanges: false });
  const [justSaved, setJustSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Always-current save fn lives in a ref so updates don't re-render
  // (the child's `save` callback gets a new identity every render).
  const saveFnRef = useRef<(() => Promise<boolean>) | null>(null);
  const getSnapshotRef = useRef<(() => any) | null>(null);
  const handleSaveReady = useCallback((fn: (() => Promise<boolean>) | null, canEdit: boolean, hasUnsavedChanges: boolean, getSnapshot?: () => any) => {
    saveFnRef.current = fn;
    getSnapshotRef.current = getSnapshot ?? null;
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
  const REPORT_TAB_META: Record<number, { tabSlug: 'jt' | 'jm' | 'sw'; ownerName: string; ownerEmail: string; reportKey: string }> = {
    4: { tabSlug: 'jt', ownerName: 'James Turner',   ownerEmail: 'jturner@5thline.co',  reportKey: 'report-1' },
    5: { tabSlug: 'jm', ownerName: 'John Moffitt',   ownerEmail: 'jmoffitt@5thline.co', reportKey: 'report-2' },
    6: { tabSlug: 'sw', ownerName: 'Scott Williams', ownerEmail: 'swilliams@5thline.co', reportKey: 'report-3' },
  };
  const REVIEW_RECIPIENTS = [
    'mclark@5thline.co',
    'jturner@5thline.co',
    'jmoffitt@5thline.co',
    'swilliams@5thline.co',
  ];

  // Active report tab + period drives the per-(tab × period) submission lock.
  const activeMeta = REPORT_TAB_META[activeIndex];
  const { selection: activeSelection } = useSelectionFromGlobalPeriod();
  const activePeriodKey = activeMeta ? periodSlug(activeSelection) : null;
  const submission = useInsightsReportSubmission(
    activeMeta ? activeMeta.reportKey : null,
    activePeriodKey,
  );
  const isLocked = !!activeMeta && submission.isLocked;

  const sendReviewEmails = async (
    meta: { tabSlug: 'jt' | 'jm' | 'sw'; ownerName: string },
    state: 'submitted' | 'resubmitted' | 'unsubmitted',
    actorName: string,
  ) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fivelinenaitive.lovable.app';
    const url = `${origin}/insights?tab=${meta.tabSlug}`;
    const stamp = Date.now();
    const results = await Promise.all(
      REVIEW_RECIPIENTS.map((recipient) =>
        supabase.functions.invoke('send-app-email', {
          body: {
            templateName: 'insights-report-ready',
            recipientEmail: recipient,
            idempotencyKey: `insights-report-${state}-${meta.tabSlug}-${stamp}-${recipient}`,
            templateData: { ownerName: meta.ownerName, url, state, actorName },
          },
        }),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  };

  const handleSubmitForReview = async () => {
    const meta = activeMeta;
    if (!meta || submitting) return;
    setSubmitting(true);
    try {
      const isResubmit = (submission.row?.submit_count ?? 0) > 0;
      // Snapshot the current report body so the submitted version is
      // always viewable/recoverable, even if the live doc is later
      // edited or cleared.
      let snapshot: any = undefined;
      try { snapshot = getSnapshotRef.current?.() ?? undefined; } catch { /* noop */ }
      const result = await submission.submit(snapshot);
      if (!result) throw new Error('Submission state did not persist');
      const actorName = result.submitted_by_name || 'A teammate';
      await sendReviewEmails(meta, isResubmit ? 'resubmitted' : 'submitted', actorName);
      sonnerToast.success(isResubmit ? 'Report resubmitted — review email sent' : 'Report submitted — review email sent');
    } catch (err) {
      console.error('Failed to submit insights report for review', err);
      sonnerToast.error('Could not submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnsubmit = async () => {
    const meta = activeMeta;
    if (!meta || submitting) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm('Unsubmit this report? It will be reopened for editing and reviewers will be notified.')
      : true;
    if (!ok) return;
    setSubmitting(true);
    try {
      const result = await submission.unsubmit();
      if (!result) throw new Error('Unsubmit did not persist');
      const actorName = result.unsubmitted_by_name || 'A teammate';
      await sendReviewEmails(meta, 'unsubmitted', actorName);
      sonnerToast.success('Report unsubmitted — reviewers notified');
    } catch (err) {
      console.error('Failed to unsubmit insights report', err);
      sonnerToast.error('Could not unsubmit report. Please try again.');
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
        borderRadius: 8,
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
            borderRadius: 6,
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
    { title: 'Quarterly Insights Report — JT', tabLabel: 'JT', render: () => <QuarterlyReportSlot key="qir-slot-JT" reportKey="report-1" defaultAuthor="James Turner"   persona="JT" onSaveReady={handleSaveReady} locked={activeIndex === 4 && isLocked} lockBanner={activeIndex === 4 ? lockBanner : null} /> },
    { title: 'Quarterly Insights Report — JM', tabLabel: 'JM', render: () => <QuarterlyReportSlot key="qir-slot-JM" reportKey="report-2" defaultAuthor="John Moffitt"   persona="JM" onSaveReady={handleSaveReady} locked={activeIndex === 5 && isLocked} lockBanner={activeIndex === 5 ? lockBanner : null} /> },
    { title: 'Quarterly Insights Report — SW', tabLabel: 'SW', render: () => <QuarterlyReportSlot key="qir-slot-SW" reportKey="report-3" defaultAuthor="Scott Williams" persona="SW" onSaveReady={handleSaveReady} locked={activeIndex === 6 && isLocked} lockBanner={activeIndex === 6 ? lockBanner : null} /> },
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

  const submittedAtLabel = submission.row?.submitted_at
    ? new Date(submission.row.submitted_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const hasSnapshot = isReportTab && !!submission.row?.content_snapshot;
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const lockBanner = isReportTab && isLocked ? (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto 8px',
      padding: '10px 14px',
      borderRadius: 10,
      background: 'rgba(126,184,247,0.08)',
      border: '1px solid rgba(126,184,247,0.35)',
      color: 'rgba(200,225,255,0.95)',
      fontSize: 12,
      lineHeight: 1.5,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <Lock size={14} />
      <span>
        Submitted for review{submission.row?.submitted_by_name ? ` by ${submission.row.submitted_by_name}` : ''}{submittedAtLabel ? ` on ${submittedAtLabel}` : ''}. This report is locked. Click Unsubmit to reopen for editing.
      </span>
      {hasSnapshot && (
        <button
          type="button"
          onClick={() => setSnapshotOpen(true)}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.03em',
            padding: '4px 10px',
            borderRadius: 999,
            border: '0.5px solid rgba(126,184,247,0.55)',
            background: 'rgba(126,184,247,0.15)',
            color: 'rgba(230,240,255,0.98)',
            cursor: 'pointer',
          }}
          title="Open the exact report body that was submitted"
        >
          <Eye size={12} /> View submitted version
        </button>
      )}
    </div>
  ) : null;

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
          {!isLocked && (
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
          )}
          {/* Submit / Unsubmit — only on JT/JM/SW report tabs. Filled
              primary style to read as distinct from the ghost Save button. */}
          <button
            type="button"
            onClick={() => { void (isLocked ? handleUnsubmit() : handleSubmitForReview()); }}
            disabled={submitting || submission.working || !activeMeta || submission.loading}
            title={isLocked
              ? `Unsubmit ${activeMeta?.ownerName ?? "this owner"}'s Insights Report — reopens for editing and notifies reviewers`
              : `Notify reviewers that ${activeMeta?.ownerName ?? "this owner"}'s Insights Report is ready`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '6px 14px',
              borderRadius: 999,
              border: isLocked
                ? '0.5px solid rgba(245,158,11,0.55)'
                : '0.5px solid rgba(80,140,255,0.55)',
              cursor: submitting ? 'wait' : 'pointer',
              color: '#0a2540',
              background: isLocked
                ? 'linear-gradient(180deg, #fcd34d, #f59e0b)'
                : 'linear-gradient(180deg, #7ed0ff, #4db8ff)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              opacity: submitting ? 0.7 : 1,
              transition: 'opacity .15s',
            }}
          >
            {submitting
              ? <Loader2 size={12} className="animate-spin" />
              : isLocked
                ? <Unlock size={12} />
                : <Send size={12} />}
            {submitting
              ? (isLocked ? 'Unsubmitting…' : 'Submitting…')
              : (isLocked ? 'Unsubmit' : ((submission.row?.submit_count ?? 0) > 0 ? 'Resubmit' : 'Submit'))}
          </button>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <QuarterlyReportPrintStyles />
        {activePage.render()}
      </div>
      {snapshotOpen && submission.row?.content_snapshot && (
        <SubmittedSnapshotDialog
          snapshot={submission.row.content_snapshot}
          submittedAtLabel={submittedAtLabel}
          submittedByName={submission.row?.submitted_by_name ?? null}
          title={activeMeta ? `Submitted version — ${activeMeta.ownerName}` : 'Submitted version'}
          onClose={() => setSnapshotOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Read-only modal showing the exact report body that was captured when
 * the report was submitted for review. Uses the live QIR renderer with
 * canEdit=false so the layout matches the interactive report 1:1.
 */
function SubmittedSnapshotDialog({ snapshot, submittedAtLabel, submittedByName, title, onClose }: {
  snapshot: any;
  submittedAtLabel: string | null;
  submittedByName: string | null;
  title: string;
  onClose: () => void;
}) {
  const noop = useCallback(() => {}, []);
  const noopSave = useCallback(async () => true, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,10,24,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(10,20,40,0.98)',
          border: '1px solid rgba(80,140,255,0.28)',
          borderRadius: 12,
          width: 'min(1200px, 100%)',
          maxHeight: '100%',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid rgba(80,140,255,0.18)',
          color: 'rgba(220,235,255,0.95)',
        }}>
          <Lock size={14} />
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'rgba(180,205,240,0.75)' }}>
            {submittedByName ? `Submitted by ${submittedByName}` : 'Submitted'}
            {submittedAtLabel ? ` · ${submittedAtLabel}` : ''}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: 'none', color: 'rgba(220,235,255,0.9)',
              cursor: 'pointer', padding: 4,
            }}
          >
            <XIcon size={16} />
          </button>
        </div>
        <div style={{ overflow: 'auto', padding: 16 }}>
          <QuarterlyInsightsReportPage
            s={snapshot}
            set={noop as any}
            reset={noop}
            print={noop}
            save={noopSave}
            canEdit={false}
            reportKey={'snapshot'}
            titlePrefix={''}
            ownerName={''}
            activeCompositeKey={null}
            fetchedCompositeKey={null}
            isDirty={false}
            isSaving={false}
            unsavedChangesWarning={null}
          />
        </div>
      </div>
    </div>
  );
}
