import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OmniSearchResults } from './OmniSearchResults';
import type { OmniResult } from './omniSearch';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CollapsibleSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Debounce window before onChange fires. Defaults to 350ms. */
  debounceMs?: number;
}

export function CollapsibleSearch({ value, onChange, debounceMs = 350 }: CollapsibleSearchProps) {
  const [expanded, setExpanded] = useState(false);
  // Local draft so typing is never erased by parent re-renders / refetches.
  const [localValue, setLocalValue] = useState(value);
  const isFocusedRef = useRef(false);
  const hasPendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = expanded || localValue.length > 0;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsRef = useRef<OmniResult[]>([]);
  const handleResults = useCallback((r: OmniResult[]) => {
    resultsRef.current = r;
    setActiveIndex((i) => (i >= r.length ? 0 : i));
  }, []);
  const selectResult = (r: OmniResult) => {
    setMenuOpen(false);
    // Clear the page filter so the chosen record isn't hidden behind it.
    setLocalValue('');
    commitNow('');
    inputRef.current?.blur();
    navigate(r.path);
  };

  // Mirror parent value ONLY when we're not actively typing.
  useEffect(() => {
    if (!isFocusedRef.current && !hasPendingRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  // Keep the box from ever running under the floating menu header: measure the
  // gap between our left edge and the header pill, and clamp the width to it.
  // Sized dynamically: sits just right of the workspace logo and stops before
  // the floating menu pill, growing on wide screens and shrinking on small ones.
  // Width scales with screen size (between MIN_W and MAX_W) and is measured
  // only against header anchors (logo + menu pill), never view content, so
  // grid / pipeline / list / timeline all render it identically.
  const MIN_W = 120;
  const MAX_W = 320;
  const [boxWidth, setBoxWidth] = useState<number>(240);

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const wrapper = el.parentElement;
      const logo = document.querySelector('.workspace-logo img') as HTMLImageElement | null;
      const lr = logo ? logo.getBoundingClientRect() : null;
      // Use the full logo box (never overlap) with a safe fallback while
      // the image hasn't rendered yet.
      const logoRight = lr && lr.width > 0 ? lr.right : 260;
      const left = Math.round(Math.max(logoRight, 140) + 16);
      if (wrapper && wrapper.style.left !== `${left}px`) wrapper.style.left = `${left}px`;
      const header = document.querySelector('.floating-header') as HTMLElement | null;
      const headerLeft = header ? header.getBoundingClientRect().left : window.innerWidth;
      const available = headerLeft - left - 16;
      // Fluid: ~18% of viewport, clamped, and never past the menu pill.
      const fluid = Math.round(window.innerWidth * 0.18);
      setBoxWidth(Math.max(MIN_W, Math.min(MAX_W, fluid, available)));
    };
    measure();
    const logoImg = document.querySelector('.workspace-logo img');
    logoImg?.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 500);
    return () => {
      logoImg?.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
      window.clearInterval(id);
    };
  }, []);

  const scheduleCommit = (next: string) => {
    hasPendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      hasPendingRef.current = false;
      onChange(next);
    }, debounceMs);
  };

  const commitNow = (next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    hasPendingRef.current = false;
    if (next !== value) onChange(next);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleBlur = () => {
    isFocusedRef.current = false;
    setMenuOpen(false);
    commitNow(localValue);
    if (localValue.length === 0) {
      setExpanded(false);
    }
  };

  const handleClear = () => {
    setLocalValue('');
    commitNow('');
    setExpanded(false);
  };

  // Always rendered as an open search box.


  // Expanded: input styled to match the Button's border/height/radius
  return (
    <div
      ref={containerRef}
      className="deals-search-box relative inline-flex items-center h-[40px] text-sm transition-colors duration-200"
      style={{
        width: boxWidth,
        backgroundColor: 'var(--bg-card)',
        border: '1px solid #52617e',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'none',
      }}
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(next);
          setMenuOpen(true);
          setActiveIndex(0);
          scheduleCommit(next);
        }}
        onFocus={() => {
          isFocusedRef.current = true;
          setExpanded(true);
          if (localValue) setMenuOpen(true);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          const list = resultsRef.current;
          if (e.key === 'ArrowDown' && menuOpen && list.length) {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % list.length);
          } else if (e.key === 'ArrowUp' && menuOpen && list.length) {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + list.length) % list.length);
          } else if (e.key === 'Escape') {
            setMenuOpen(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (menuOpen && list[activeIndex]) selectResult(list[activeIndex]);
            else commitNow(localValue);
          }
        }}
        placeholder="Search deals, contacts, companies, funding sources…"
        aria-label="Search everything"
        className="h-full w-full bg-transparent pl-8 pr-7 outline-none text-sm placeholder:text-muted-foreground"
      />
      {localValue.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {menuOpen && localValue.trim() && (
        <OmniSearchResults
          query={localValue}
          activeIndex={activeIndex}
          onResults={handleResults}
          onSelect={selectResult}
          onHover={setActiveIndex}
        />
      )}
    </div>
  );
}
