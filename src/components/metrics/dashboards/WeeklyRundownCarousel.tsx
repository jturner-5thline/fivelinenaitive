import { useState, useCallback, useEffect, useRef, ReactNode, TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WeeklyRundownReadOnlyCashflow } from './WeeklyRundownReadOnlyCashflow';
import { WeeklyRundownOpsProjectsPage } from './WeeklyRundownOpsProjectsPage';

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
    { title: 'Ops & Projects', render: () => <WeeklyRundownOpsProjectsPage /> },
    { title: 'Weekly Cashflow', render: () => <WeeklyRundownReadOnlyCashflow /> },
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

  // Floating side-edge nav buttons — vertically centered overlay controls,
  // mirroring the Daily Rundown widget's content-navigation feel.
  const sideArrowBtnStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 40,
    height: 40,
    borderRadius: 999,
    border: '1px solid rgba(80,150,220,0.25)',
    background: 'rgba(20,40,65,0.55)',
    backdropFilter: 'blur(6px)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background .2s, opacity .2s',
    zIndex: 50,
    opacity: 0.75,
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Floating side-edge nav controls (overlay, vertically centered) */}
      <button
        onClick={() => goTo(-1)}
        aria-label="Previous page"
        style={{ ...sideArrowBtnStyle, left: 12 }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(40,110,180,0.7)';
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(20,40,65,0.55)';
          e.currentTarget.style.opacity = '0.75';
        }}
      >
        <ChevronLeft size={18} color="rgba(200,225,245,0.9)" />
      </button>
      <button
        onClick={() => goTo(1)}
        aria-label="Next page"
        style={{ ...sideArrowBtnStyle, right: 12 }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(40,110,180,0.7)';
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(20,40,65,0.55)';
          e.currentTarget.style.opacity = '0.75';
        }}
      >
        <ChevronRight size={18} color="rgba(200,225,245,0.9)" />
      </button>

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
