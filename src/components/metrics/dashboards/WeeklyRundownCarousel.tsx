import { useState, useCallback, useEffect, useRef, ReactNode, TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WeeklyRundownReadOnlyCashflow } from './WeeklyRundownReadOnlyCashflow';
import { WeeklyRundownPipelineClientsPage } from './WeeklyRundownPipelineClientsPage';

interface WeeklyRundownCarouselProps {
  /** The existing Weekly Rundown (ManagementSnapshotDashboard) content rendered as Page 1. */
  page1: ReactNode;
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        color: 'rgba(180,210,235,0.7)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#e8f4ff', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 480, lineHeight: 1.5 }}>{description}</div>
      <div
        style={{
          marginTop: 18,
          padding: '6px 12px',
          borderRadius: 999,
          background: 'rgba(80,160,230,0.1)',
          border: '1px solid rgba(80,160,230,0.25)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.4px',
          color: 'rgba(180,210,235,0.85)',
        }}
      >
        COMING SOON
      </div>
    </div>
  );
}

export function WeeklyRundownCarousel({ page1 }: WeeklyRundownCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const PAGES: { title: string; render: () => ReactNode }[] = [
    { title: 'Weekly Rundown', render: () => page1 },
    { title: 'Weekly Cashflow', render: () => <WeeklyRundownReadOnlyCashflow /> },
    {
      title: 'Pipeline & Clients',
      render: () => <WeeklyRundownPipelineClientsPage />,
    },
    {
      title: 'Ops & Projects',
      render: () => (
        <PlaceholderPage
          title="Ops & Projects"
          description="This page will mirror the Daily Briefing layout (Asana sync) — overdue, due today, due this week, completed, blockers — aggregated across the entire team."
        />
      ),
    },
  ];

  const goTo = useCallback((dir: -1 | 1) => {
    setActiveIndex(prev => (prev + dir + PAGES.length) % PAGES.length);
  }, [PAGES.length]);

  const onTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) goTo(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  // Keyboard navigation (left/right arrows)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') goTo(-1);
      else if (e.key === 'ArrowRight') goTo(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  const arrowBtnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(80,150,220,0.25)',
    background: 'rgba(40,90,150,0.35)', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', transition: 'background .2s',
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Sub-page navigation header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: '12px 16px', position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(15,25,35,0.92)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, marginBottom: 8,
      }}>
        <button
          onClick={() => goTo(-1)}
          aria-label="Previous page"
          style={arrowBtnStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(40,110,180,0.55)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(40,90,150,0.35)')}
        >
          <ChevronLeft size={16} color="rgba(140,190,230,0.7)" />
        </button>

        <div style={{ textAlign: 'center', minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f4ff', letterSpacing: '-.2px' }}>
            {PAGES[activeIndex].title}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
            {PAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                aria-label={`Go to page ${i + 1}`}
                style={{
                  width: 7, height: 7, borderRadius: '50%', border: 'none', cursor: 'pointer', transition: 'background .2s',
                  background: i === activeIndex ? 'rgba(80,160,230,0.7)' : 'rgba(80,140,200,0.25)',
                }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => goTo(1)}
          aria-label="Next page"
          style={arrowBtnStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(40,110,180,0.55)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(40,90,150,0.35)')}
        >
          <ChevronRight size={16} color="rgba(140,190,230,0.7)" />
        </button>

        <span style={{
          fontSize: 10, color: 'rgba(140,175,200,0.55)', fontWeight: 600,
          letterSpacing: '.5px', position: 'absolute', right: 16,
        }}>
          {activeIndex + 1} / {PAGES.length}
        </span>
      </div>

      {/* Active page content. Page 1 is always mounted (display:none when inactive)
          so its widget grid / period selector state is preserved across page changes. */}
      <div>
        <div style={{ display: activeIndex === 0 ? 'block' : 'none' }}>
          {PAGES[0].render()}
        </div>
        {activeIndex !== 0 && PAGES[activeIndex].render()}
      </div>
    </div>
  );
}
