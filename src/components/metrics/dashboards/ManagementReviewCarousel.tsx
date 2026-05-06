import { useState, useCallback, useRef, useEffect, TouchEvent } from 'react';
import { ManagementReviewDashboard } from './ManagementReviewDashboard';
import { BenchmarkForecastsPage } from './BenchmarkForecastsPage';
import { KeyMetricsPage } from './KeyMetricsPage';
import {
  QuarterlyReportPrintStyles,
  QuarterlyInsightsReportPage,
  useQuarterlyReportState,
} from './QuarterlyInsightsReport';

function QuarterlyReportSlot({ reportKey }: { reportKey: string }) {
  const { state, setState, reset, save, print, canEdit } = useQuarterlyReportState(
    undefined,
    `qir:${reportKey}`,
  );
  return (
    <QuarterlyInsightsReportPage
      s={state}
      set={setState}
      reset={reset}
      save={save}
      print={print}
      canEdit={canEdit}
      reportKey={reportKey}
    />
  );
}

export function ManagementReviewCarousel({ isEditMode = false, onExitEditMode }: { isEditMode?: boolean; onExitEditMode?: () => void } = {}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const PAGES: { title: string; tabLabel: string; render: () => JSX.Element }[] = [
    { title: 'Insights Dashboard',                   tabLabel: 'Dashboard',  render: () => <ManagementReviewDashboard isEditMode={isEditMode} onExitEditMode={onExitEditMode} /> },
    { title: 'Benchmark Forecasts',                  tabLabel: 'Forecasts',  render: () => <BenchmarkForecastsPage /> },
    { title: 'Key Metrics',                          tabLabel: 'Key Metrics',render: () => <KeyMetricsPage /> },
    { title: 'Quarterly Insights Report — Report 1', tabLabel: 'Report 1',   render: () => <QuarterlyReportSlot reportKey="report-1" /> },
    { title: 'Quarterly Insights Report — Report 2', tabLabel: 'Report 2',   render: () => <QuarterlyReportSlot reportKey="report-2" /> },
    { title: 'Quarterly Insights Report — Report 3', tabLabel: 'Report 3',   render: () => <QuarterlyReportSlot reportKey="report-3" /> },
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

  return (
    <div
      style={{ position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Pill tab navigation — direct jump to any section */}
      <div
        role="tablist"
        aria-label="Insights sections"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 4,
          margin: '0 auto 12px',
          maxWidth: 1200,
          background: 'rgba(16,28,52,0.55)',
          border: '0.5px solid rgba(80,140,255,0.18)',
          borderRadius: 999,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          width: 'fit-content',
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
      <div style={{ position: 'relative' }}>
        <QuarterlyReportPrintStyles />
        {activePage.render()}
      </div>
    </div>
  );
}
