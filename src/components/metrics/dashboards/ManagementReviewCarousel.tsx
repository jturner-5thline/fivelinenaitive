import { useState, useCallback, useRef, useEffect, TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ManagementReviewDashboard } from './ManagementReviewDashboard';
import { BenchmarkForecastsPage } from './BenchmarkForecastsPage';
import { KeyMetricsPage } from './KeyMetricsPage';
import {
  QuarterlyInsightsReportPage,
  QuarterlyReportPrintStyles,
  createQuarterlyReportSeed,
  useQuarterlyReportState,
} from './QuarterlyInsightsReport';

export function ManagementReviewCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const reportOne = useQuarterlyReportState(createQuarterlyReportSeed(), 'naitive.quarterlyReport.v1.report1');
  const reportTwo = useQuarterlyReportState(createQuarterlyReportSeed(), 'naitive.quarterlyReport.v1.report2');
  const reportThree = useQuarterlyReportState(createQuarterlyReportSeed(), 'naitive.quarterlyReport.v1.report3');

  const PAGES: { title: string; render: () => JSX.Element }[] = [
    { title: 'Insights Dashboard',                          render: () => <ManagementReviewDashboard /> },
    { title: 'Benchmark Forecasts',                         render: () => <BenchmarkForecastsPage /> },
    { title: 'Key Metrics',                                 render: () => <KeyMetricsPage /> },
    { title: 'Quarterly Insights Report — Report 1',        render: () => <QuarterlyInsightsReportPage s={reportOne.state} set={reportOne.setState} reset={reportOne.reset} save={reportOne.save} canEdit={reportOne.canEdit} print={reportOne.print} reportKey="naitive.quarterlyReport.v1.report1" /> },
    { title: 'Quarterly Insights Report — Report 2',        render: () => <QuarterlyInsightsReportPage s={reportTwo.state} set={reportTwo.setState} reset={reportTwo.reset} save={reportTwo.save} canEdit={reportTwo.canEdit} print={reportTwo.print} reportKey="naitive.quarterlyReport.v1.report2" /> },
    { title: 'Quarterly Insights Report — Report 3',        render: () => <QuarterlyInsightsReportPage s={reportThree.state} set={reportThree.setState} reset={reportThree.reset} save={reportThree.save} canEdit={reportThree.canEdit} print={reportThree.print} reportKey="naitive.quarterlyReport.v1.report3" /> },
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
      {/* Floating side navigation arrows + page content (no extra background wrapper) */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => goTo(-1)}
          aria-label="Previous page"
          className="qir-no-print"
          style={{
            position: 'fixed', left: 12, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: 12,
            border: '1px solid rgba(80,150,220,0.25)',
            background: 'rgba(16,28,52,0.75)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s, border-color .2s', zIndex: 40,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(40,110,180,0.55)';
            e.currentTarget.style.borderColor = 'rgba(120,170,255,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(16,28,52,0.75)';
            e.currentTarget.style.borderColor = 'rgba(80,150,220,0.25)';
          }}
        >
          <ChevronLeft size={20} color="rgba(200,225,245,0.9)" />
        </button>

        <button
          onClick={() => goTo(1)}
          aria-label="Next page"
          className="qir-no-print"
          style={{
            position: 'fixed', right: 12, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: 12,
            border: '1px solid rgba(80,150,220,0.25)',
            background: 'rgba(16,28,52,0.75)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s, border-color .2s', zIndex: 40,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(40,110,180,0.55)';
            e.currentTarget.style.borderColor = 'rgba(120,170,255,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(16,28,52,0.75)';
            e.currentTarget.style.borderColor = 'rgba(80,150,220,0.25)';
          }}
        >
          <ChevronRight size={20} color="rgba(200,225,245,0.9)" />
        </button>

        <QuarterlyReportPrintStyles />
        {activePage.render()}
      </div>
    </div>
  );
}
