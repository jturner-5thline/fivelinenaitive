import { useState, useCallback, useRef, useEffect, useMemo, TouchEvent } from 'react';
import { Save as SaveIcon, Check } from 'lucide-react';
import { ManagementReviewDashboard } from './ManagementReviewDashboard';
import { BenchmarkForecastsPage } from './BenchmarkForecastsPage';
import { KeyMetricsPage } from './KeyMetricsPage';
import {
  QuarterlyReportPrintStyles,
  QuarterlyInsightsReportPage,
  useQuarterlyReportState,
} from './QuarterlyInsightsReport';
import { useCompanyDashboardConfig } from '@/hooks/useCompanyDashboardConfig';

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

function QuarterlyReportSlot({ reportKey, defaultAuthor, persona, onSaveReady }: { reportKey: string; defaultAuthor: string; persona: string; onSaveReady?: (save: (() => void) | null, canEdit: boolean) => void }) {
  // Per-tab selection (period + quarter/month) is persisted under a small
  // dedicated key so all viewers land on the same active period. The actual
  // report payload is keyed by `qir:<reportKey>:<period>:<label>` so each
  // (tab × period) combination has its own independent saved blob.
  const { config: selection, saveConfig: saveSelection, isLoaded: selectionLoaded } =
    useCompanyDashboardConfig<ReportSelection>(
      `qir:${reportKey}:selection`,
      DEFAULT_SELECTION,
      { allowAllMembers: true },
    );

  const initial = useMemo(
    () => ({
      authors: [defaultAuthor],
      period: selection.period,
      quarter: selection.quarter,
      month: selection.month,
    } as any),
    [defaultAuthor, selection.period, selection.quarter, selection.month],
  );

  const dataKey = `qir:${reportKey}:${periodSlug(selection)}`;

  const { state, setState, reset, save, print, canEdit } = useQuarterlyReportState(
    initial,
    dataKey,
    {
      onSelectionChange: (next) => {
        saveSelection({ ...selection, ...next });
      },
    },
  );

  useEffect(() => {
    onSaveReady?.(save || null, canEdit !== false);
    return () => onSaveReady?.(null, false);
  }, [save, canEdit, onSaveReady]);

  if (!selectionLoaded) return null;

  return (
    <QuarterlyInsightsReportPage
      s={state}
      set={setState}
      reset={reset}
      print={print}
      canEdit={canEdit}
      reportKey={reportKey}
      titlePrefix={persona}
    />
  );
}

export function ManagementReviewCarousel({ isEditMode = false, onExitEditMode }: { isEditMode?: boolean; onExitEditMode?: () => void } = {}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const [reportSave, setReportSave] = useState<{ fn: (() => void) | null; canEdit: boolean }>({ fn: null, canEdit: false });
  const [justSaved, setJustSaved] = useState(false);
  const handleSaveReady = useCallback((fn: (() => void) | null, canEdit: boolean) => {
    setReportSave({ fn, canEdit });
  }, []);
  const handleSaveClick = () => {
    if (!reportSave.fn) return;
    reportSave.fn();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const PAGES: { title: string; tabLabel: string; render: () => JSX.Element }[] = [
    { title: 'Insights Dashboard',                   tabLabel: 'Dashboard',  render: () => <ManagementReviewDashboard isEditMode={isEditMode} onExitEditMode={onExitEditMode} /> },
    { title: 'Benchmark Forecasts',                  tabLabel: 'Forecasts',  render: () => <BenchmarkForecastsPage /> },
    { title: 'Key Metrics',                          tabLabel: 'Key Metrics',render: () => <KeyMetricsPage /> },
    { title: 'Quarterly Insights Report — JT', tabLabel: 'JT', render: () => <QuarterlyReportSlot key="qir-slot-JT" reportKey="report-1" defaultAuthor="James Turner"   persona="JT" onSaveReady={handleSaveReady} /> },
    { title: 'Quarterly Insights Report — JM', tabLabel: 'JM', render: () => <QuarterlyReportSlot key="qir-slot-JM" reportKey="report-2" defaultAuthor="John Moffitt"   persona="JM" onSaveReady={handleSaveReady} /> },
    { title: 'Quarterly Insights Report — SW', tabLabel: 'SW', render: () => <QuarterlyReportSlot key="qir-slot-SW" reportKey="report-3" defaultAuthor="Scott Williams" persona="SW" onSaveReady={handleSaveReady} /> },
  ];

  const goTo = useCallback((dir: -1 | 1) => {
    setActiveIndex(prev => (prev + dir + PAGES.length) % PAGES.length);
  }, [PAGES.length]);

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
              onClick={() => setActiveIndex(i)}
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
            onClick={handleSaveClick}
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
            {justSaved ? 'Saved' : 'Save'}
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
