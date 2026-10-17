import { useState, useRef, useEffect } from 'react';
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
  const MIN_W = 96;
  const [boxWidth, setBoxWidth] = useState<number>(243);

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const wrapper = el.parentElement;
      const logo = document.querySelector('.workspace-logo img, .workspace-logo svg') as HTMLElement | null;
      // The logo image has transparent padding on the right (visible
      // lettering ends at ~84% of the image width), so anchor to the
      // visible edge rather than the image box.
      const lr = logo ? logo.getBoundingClientRect() : null;
      const logoRight = lr ? lr.left + lr.width * (1612 / 1920) : 200;
      const left = Math.round(logoRight + 12);
      if (wrapper && wrapper.style.left !== `${left}px`) wrapper.style.left = `${left}px`;
      const header = document.querySelector('.floating-header') as HTMLElement | null;
      const headerLeft = header ? header.getBoundingClientRect().left : window.innerWidth;
      const available = headerLeft - left - 16;
      // Align right edge with the right edge of the left-most deal tile.
      let tileRight: number | null = null;
      let minLeft = Infinity;
      document.querySelectorAll('.deal-tile').forEach((t) => {
        const r = (t as HTMLElement).getBoundingClientRect();
        if (r.width > 50 && r.left < minLeft) { minLeft = r.left; tileRight = r.right; }
      });
      if (tileRight != null) {
        setBoxWidth(Math.max(MIN_W, Math.min(available, Math.round(tileRight) - left)));
      } else {
        const maxW = Math.round(Math.min(380, Math.max(200, window.innerWidth * 0.18)));
        setBoxWidth(Math.max(MIN_W, Math.min(maxW, available)));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 500);
    return () => {
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
          scheduleCommit(next);
        }}
        onFocus={() => {
          isFocusedRef.current = true;
          setExpanded(true);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitNow(localValue);
          }
        }}
        placeholder="Search..."
        aria-label="Search deals"
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
    </div>
  );
}
