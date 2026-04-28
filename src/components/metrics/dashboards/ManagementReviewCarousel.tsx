import { useState, useCallback, useRef, TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ManagementReviewDashboard } from './ManagementReviewDashboard';
import { BenchmarkForecastsPage } from './BenchmarkForecastsPage';
import { KeyMetricsPage } from './KeyMetricsPage';

const PAGES = [
  { title: 'Insights Dashboard', component: ManagementReviewDashboard },
  { title: 'Benchmark Forecasts', component: BenchmarkForecastsPage },
  { title: 'Key Metrics', component: KeyMetricsPage },
];

export function ManagementReviewCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback((dir: -1 | 1) => {
    setActiveIndex(prev => (prev + dir + PAGES.length) % PAGES.length);
  }, []);

  const onTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) goTo(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const ActivePage = PAGES[activeIndex].component;

  return (
    <div
      style={{ background: '#0f1923', minHeight: '100vh', position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Navigation header (title + dots only — arrows are floating side overlays) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: '12px 16px', position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(15,25,35,0.92)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ textAlign: 'center', minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f4ff', letterSpacing: '-.2px' }}>
            {PAGES[activeIndex].title}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
            {PAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                style={{
                  width: 7, height: 7, borderRadius: '50%', border: 'none', cursor: 'pointer', transition: 'background .2s',
                  background: i === activeIndex ? 'rgba(80,160,230,0.7)' : 'rgba(80,140,200,0.25)',
                }}
              />
            ))}
          </div>
        </div>

        <span style={{ fontSize: 10, color: 'rgba(140,175,200,0.4)', fontWeight: 600, letterSpacing: '.5px', position: 'absolute', right: 16 }}>
          {activeIndex + 1} / {PAGES.length}
        </span>
      </div>

      {/* Floating side navigation arrows + page content */}
      <div style={{ position: 'relative', padding: '0 48px' }}>
        <button
          onClick={() => goTo(-1)}
          aria-label="Previous page"
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

        <ActivePage />
      </div>
    </div>
  );
}
