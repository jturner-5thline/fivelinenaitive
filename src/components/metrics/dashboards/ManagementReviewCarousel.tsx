import { useState, useCallback, useRef, useEffect, useMemo, TouchEvent } from 'react';
import { Save as SaveIcon, Check } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast as sonnerToast } from 'sonner';
import { ManagementReviewDashboard } from './ManagementReviewDashboard';
import { BenchmarkForecastsPage } from './BenchmarkForecastsPage';
import { KeyMetricsPage } from './KeyMetricsPage';
import {
  QuarterlyReportPrintStyles,
  QuarterlyInsightsReportPage,
  useQuarterlyReportState,
} from './QuarterlyInsightsReport';
import { useCompanyDashboardConfig } from '@/hooks/useCompanyDashboardConfig';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';

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

  // Sanity check: confirm the derived composite key matches a saved row.
  // If this (period × tab) has never been saved but other periods for the
  // same tab exist in Supabase, surface a warning so users know they're
  // looking at an empty/seed report rather than the data they expected.
  const { company } = useCompany();
  const [keyMismatch, setKeyMismatch] = useState<{ savedKeys: string[] } | null>(null);
  useEffect(() => {
    if (!company?.id || !selectionLoaded) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('fpa_dashboard_config')
        .eq('company_id', company.id)
        .maybeSingle();
      if (cancelled) return;
      const cfg = (data?.fpa_dashboard_config as Record<string, any>) || {};
      const prefix = `qir:${reportKey}:`;
      const savedKeys = Object.keys(cfg).filter(k =>
        k.startsWith(prefix) && !k.endsWith(':selection'),
      );
      const matches = savedKeys.includes(dataKey);
      setKeyMismatch(!matches && savedKeys.length > 0 ? { savedKeys } : null);
    })();
    return () => { cancelled = true; };
  }, [company?.id, selectionLoaded, dataKey, reportKey]);

  if (!selectionLoaded) return null;

  return (
    <>
      {keyMismatch && (
        <div style={{
          margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10,
          background: 'rgba(245, 158, 11, 0.10)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          color: 'rgb(252, 211, 77)', display: 'flex', alignItems: 'flex-start', gap: 10,
          fontSize: 12, lineHeight: 1.5,
        }}>
          <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              No saved data for <code>{dataKey}</code>
            </div>
            <div style={{ opacity: 0.85 }}>
              Showing seed defaults. Saved periods for this tab:&nbsp;
              {keyMismatch.savedKeys
                .map(k => k.replace(`qir:${reportKey}:`, ''))
                .join(', ')}
            </div>
          </div>
        </div>
      )}
      <QuarterlyInsightsReportPage
        s={state}
        set={setState}
        reset={reset}
        print={print}
        save={save}
        canEdit={canEdit}
        reportKey={reportKey}
        titlePrefix={persona}
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
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const [reportSave, setReportSave] = useState<{ fn: (() => Promise<boolean>) | null; canEdit: boolean; hasUnsavedChanges: boolean }>({ fn: null, canEdit: false, hasUnsavedChanges: false });
  const [justSaved, setJustSaved] = useState(false);
  const handleSaveReady = useCallback((fn: (() => Promise<boolean>) | null, canEdit: boolean, hasUnsavedChanges: boolean) => {
    setReportSave({ fn, canEdit, hasUnsavedChanges });
  }, []);
  const handleSaveClick = async () => {
    if (!reportSave.fn) return;
    const saved = await reportSave.fn();
    if (!saved) return;
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };
  const attemptSetActiveIndex = useCallback((nextIndex: number | ((prev: number) => number)) => {
    if (reportSave.hasUnsavedChanges) {
      sonnerToast.error('You have unsaved changes. Save the report before leaving this tab.');
      return;
    }
    setActiveIndex(nextIndex);
  }, [reportSave.hasUnsavedChanges]);

  const PAGES: { title: string; tabLabel: string; render: () => JSX.Element }[] = [
    { title: 'Insights Dashboard',                   tabLabel: 'Dashboard',  render: () => <ManagementReviewDashboard isEditMode={isEditMode} onExitEditMode={onExitEditMode} /> },
    { title: 'Benchmark Forecasts',                  tabLabel: 'Forecasts',  render: () => <BenchmarkForecastsPage /> },
    { title: 'Key Metrics',                          tabLabel: 'Key Metrics',render: () => <KeyMetricsPage /> },
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
  const isReportTab = activeIndex >= 3;

  return (
    <div
      style={{ position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Pill tab navigation — direct jump to any section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto 12px', maxWidth: 1200, width: 'fit-content' }}>
        <div
          role="tablist"
          aria-label="Insights sections"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: 4,
            background: 'rgba(16,28,52,0.55)',
            border: '0.5px solid rgba(80,140,255,0.18)',
            borderRadius: 999,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {PAGES.map((p, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={p.title}
              role="tab"
              aria-selected={active}
              onClick={() => attemptSetActiveIndex(i)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                color: active ? '#0a2540' : 'rgba(200,225,255,0.78)',
                background: active
                  ? 'linear-gradient(180deg, #7ed0ff, #4db8ff)'
                  : 'transparent',
                transition: 'background .15s, color .15s',
              }}
            >
              {p.tabLabel}
            </button>
          );
          })}
        </div>
        {isReportTab && (
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
      </div>
      <div style={{ position: 'relative' }}>
        <QuarterlyReportPrintStyles />
        {activePage.render()}
      </div>
    </div>
  );
}
