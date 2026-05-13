import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Building2,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';
import { useCopilotStore } from '@/stores/copilotStore';
import { useAnyDialogOpen } from '@/hooks/useAnyDialogOpen';
import { useDealsContext } from '@/contexts/DealsContext';
import { useLenders } from '@/contexts/LendersContext';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { cn } from '@/lib/utils';
import { AICopilotPanel } from '@/components/AICopilotPanel';
import { AskNaitiveBar } from '@/components/copilot/AskNaitiveBar';

const QUICK_PAGES: { name: string; path: string }[] = [
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'Deals', path: '/deals' },
  { name: 'Lenders', path: '/lenders' },
  { name: 'Contacts', path: '/contacts' },
  { name: 'Companies', path: '/companies' },
  { name: 'Analytics', path: '/analytics' },
  { name: 'Metrics', path: '/metrics' },
  { name: 'Insights', path: '/insights' },
  { name: 'Research', path: '/research' },
  { name: 'Reports', path: '/reports' },
  { name: 'Notifications', path: '/notifications' },
  { name: 'Settings', path: '/settings' },
  { name: 'Help', path: '/help' },
];

type Suggestion =
  | { kind: 'deal'; id: string; label: string; sublabel?: string; path: string }
  | { kind: 'lender'; id: string; label: string; sublabel?: string; path: string }
  | { kind: 'page'; id: string; label: string; path: string };

/**
 * Heuristic intent router. Anything that looks like a question, command, or
 * multi-clause prompt is treated as AI; short keyword/entity lookups stay as
 * search. Suggestions still render alongside AI intent so the user can pick
 * a record directly.
 */
function isAiIntent(raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;
  if (/[?]/.test(q)) return true;
  if (
    /^(how|what|why|when|where|who|show|find|list|summarize|summarise|draft|create|make|generate|explain|compare|analyze|analyse|tell|give|email|write|plan|schedule|remind|update|change|move|add|delete|cancel|open|close)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return true;
  return false;
}

export function CopilotToggleButton() {
  const togglePanel = useCopilotStore((s) => s.togglePanel);
  const openPanelWithPrompt = useCopilotStore((s) => s.openPanelWithPrompt);
  const isOpen = useCopilotStore((s) => s.isOpen);
  const isMinimized = useCopilotStore((s) => s.isMinimized);
  const expandPanel = useCopilotStore((s) => s.expandPanel);
  const isProcessing = useCopilotStore((s) => s.isProcessing);
  const unreadCount = useCopilotStore((s) => s.unreadCount);
  const demoMode = useCopilotStore((s) => s.demoMode);
  const demoTypedPrompt = useCopilotStore((s) => s.demoTypedPrompt);
  const hasOpenModal = useAnyDialogOpen();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { deals } = useDealsContext();
  const { lenders } = useLenders();

  // ── Persisted bar width ────────────────────────────────────────────────
  // The user can drag the left edge of the bar to resize it. The pixel
  // width is persisted to localStorage so the layout stays consistent
  // across sessions and routes.
  const BAR_WIDTH_KEY = 'naitive:bar-width';
  const BAR_WIDTH_MIN = 280;
  const BAR_WIDTH_MAX = 960;
  const BAR_WIDTH_DEFAULT = 432;
  const [barWidth, setBarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return BAR_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(BAR_WIDTH_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return BAR_WIDTH_DEFAULT;
    return Math.min(BAR_WIDTH_MAX, Math.max(BAR_WIDTH_MIN, parsed));
  });
  useEffect(() => {
    try { window.localStorage.setItem(BAR_WIDTH_KEY, String(Math.round(barWidth))); } catch {}
  }, [barWidth]);

  const resizingRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    resizingRef.current = { startX: e.clientX, startW: barWidth };
    const onMove = (ev: PointerEvent) => {
      const s = resizingRef.current;
      if (!s) return;
      // Dragging the LEFT handle outward (left) grows the bar; because
      // the bar is centered, we grow by 2x the delta to keep the right
      // edge symmetric.
      const delta = s.startX - ev.clientX;
      const next = Math.min(BAR_WIDTH_MAX, Math.max(BAR_WIDTH_MIN, s.startW + delta * 2));
      setBarWidth(next);
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const onResizeDoubleClick = () => setBarWidth(BAR_WIDTH_DEFAULT);

  // ── Debug centering overlay ────────────────────────────────────────────
  // Toggle with Shift+Ctrl+D / Shift+Cmd+D. Draws the main content's
  // center line, the bar's center line, and the pixel delta so we can
  // verify the bar stays centered within the main content module as the
  // sidebar opens/closes and the viewport resizes.
  const [debug, setDebug] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('naitive:bar-debug') === '1';
  });
  const [debugRects, setDebugRects] = useState<{
    main: { left: number; top: number; width: number; height: number };
    bar: { left: number; top: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setDebug((d) => {
          const next = !d;
          try { window.localStorage.setItem('naitive:bar-debug', next ? '1' : '0'); } catch {}
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!debug) {
      setDebugRects(null);
      return;
    }
    const barEl = barRef.current;
    const mainEl = barEl?.closest('main') as HTMLElement | null;
    if (!barEl || !mainEl) return;

    const update = () => {
      const m = mainEl.getBoundingClientRect();
      const b = barEl.getBoundingClientRect();
      setDebugRects({
        main: { left: m.left, top: m.top, width: m.width, height: m.height },
        bar: { left: b.left, top: b.top, width: b.width, height: b.height },
      });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(mainEl);
    ro.observe(barEl);
    ro.observe(document.body);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const interval = window.setInterval(update, 250); // catch sidebar transitions

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(interval);
    };
  }, [debug, focused, value, isOpen, hasOpenModal]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'k')) {
        e.preventDefault();
        if (e.key === 'j' && isOpen) {
          togglePanel();
        } else {
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel, isOpen]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const out: Suggestion[] = [];

    if (deals?.length) {
      let count = 0;
      for (const d of deals) {
        const company = (d.company || '').toLowerCase();
        if (!company) continue;
        if (company.includes(q)) {
          out.push({
            kind: 'deal',
            id: d.id,
            label: d.company,
            sublabel: d.stage,
            path: `/deal/${d.id}`,
          });
          count += 1;
          if (count >= 5) break;
        }
      }
    }

    if (lenders?.length) {
      let count = 0;
      for (const l of lenders) {
        const name = (l.name || '').toLowerCase();
        if (!name) continue;
        if (name.includes(q)) {
          out.push({
            kind: 'lender',
            id: l.name,
            label: l.name,
            sublabel: l.contact?.name,
            path: `/lenders?search=${encodeURIComponent(l.name)}`,
          });
          count += 1;
          if (count >= 5) break;
        }
      }
    }

    const pages = QUICK_PAGES.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
    for (const p of pages) {
      out.push({ kind: 'page', id: p.path, label: p.name, path: p.path });
    }

    return out.slice(0, 10);
  }, [value, deals, lenders]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  // Always render the Ask bar when the panel is open — the bar IS the
  // input for the popup, so it must remain visible above the (sticky-bottom)
  // panel even while the transcript is showing or minimized.
  if (hasOpenModal) return null;

  const askAi = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    openPanelWithPrompt(trimmed);
    setValue('');
  };

  const goTo = (path: string) => {
    navigate(path);
    setValue('');
    inputRef.current?.blur();
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    if (suggestions.length > 0 && activeIndex > 0 && activeIndex <= suggestions.length) {
      const s = suggestions[activeIndex - 1];
      goTo(s.path);
      return;
    }
    askAi(text);
  };

  const showDropdown = focused && value.trim().length > 0;
  const aiIntent = isAiIntent(value);
  const dropdownItemCount = suggestions.length + 1; // +1 for the AI row at index 0

  // Compute debug numbers up-front so the overlay JSX stays simple.
  const debugView = (() => {
    if (!debug || !debugRects) return null;
    const mainCenter = debugRects.main.left + debugRects.main.width / 2;
    const barCenter = debugRects.bar.left + debugRects.bar.width / 2;
    const delta = barCenter - mainCenter;
    return { mainCenter, barCenter, delta };
  })();

  return (
    <>
    <div
      aria-hidden={false}
      className="pointer-events-none sticky inset-x-0 z-50 mt-auto flex justify-center"
      style={{
        bottom: 'max(24px, env(safe-area-inset-bottom))',
        marginTop: 'auto',
      }}
    >
      <div
        className="pointer-events-auto flex flex-col items-center gap-2"
        style={{ width: `min(${barWidth}px, calc(100% - 32px))` }}
      >
        {/* AI transcript panel — rendered inside the same width-defining
            wrapper as the Ask bar so it inherits identical horizontal
            bounds (no independent width math). */}
        <AICopilotPanel />
        {showDropdown && (
          <div
            id="naitive-unified-suggestions"
            role="listbox"
            className={cn(
              'rounded-2xl overflow-hidden border max-h-[50vh] overflow-y-auto',
              'animate-in fade-in slide-in-from-bottom-1 duration-150',
            )}
            style={{
              background: 'rgba(14, 16, 24, 0.92)',
              backdropFilter: 'blur(18px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
              borderColor: 'rgba(255, 255, 255, 0.18)',
              boxShadow:
                '0 18px 42px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Always-present "Ask naitive AI" row */}
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === 0}
              onMouseDown={(e) => { e.preventDefault(); askAi(value); }}
              onMouseEnter={() => setActiveIndex(0)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px]',
                'transition-colors',
                activeIndex === 0
                  ? 'bg-white/[0.07] text-white'
                  : 'text-white/85 hover:bg-white/[0.04]',
              )}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{
                  background:
                    'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
                }}
              >
                <img src={naitiveAiIcon} alt="" className="h-3 w-3 brightness-0 invert" />
              </span>
              <span className="flex-1 min-w-0 truncate">
                {aiIntent ? 'Ask naitive AI: ' : 'Ask naitive AI about '}
                <span className="text-white">"{value}"</span>
              </span>
              <CornerDownLeft className="h-3.5 w-3.5 text-white/40 shrink-0" />
            </button>

            {suggestions.length > 0 && (
              <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
            )}

            {suggestions.map((s, i) => {
              const idx = i + 1;
              const isActive = idx === activeIndex;
              const Icon =
                s.kind === 'deal' ? Briefcase : s.kind === 'lender' ? Building2 : ArrowRight;
              const groupLabel =
                s.kind === 'deal' ? 'Deal' : s.kind === 'lender' ? 'Lender' : 'Page';
              return (
                <button
                  type="button"
                  key={`${s.kind}-${s.id}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => { e.preventDefault(); goTo(s.path); }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-left text-[13px]',
                    'transition-colors',
                    isActive
                      ? 'bg-white/[0.07] text-white'
                      : 'text-white/85 hover:bg-white/[0.04]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-white/55" />
                  <span className="flex-1 min-w-0 truncate">{s.label}</span>
                  {s.kind !== 'page' && s.sublabel && (
                    <span className="text-[11px] text-white/45 shrink-0 truncate max-w-[40%]">
                      {s.sublabel}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-white/35 shrink-0">
                    {groupLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <AskNaitiveBar
          ref={barRef}
          inputRef={inputRef}
          value={demoMode ? demoTypedPrompt : value}
          onChange={(next) => { if (!demoMode) setValue(next); }}
          onSubmit={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onExtraKeyDown={(e) => {
            if (showDropdown && e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % dropdownItemCount);
            } else if (showDropdown && e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + dropdownItemCount) % dropdownItemCount);
            }
          }}
          readOnly={demoMode}
          disabled={demoMode}
          placeholder={demoMode ? 'Demo running — sample prompt' : 'Search or ask naitive AI…'}
          ariaExpanded={showDropdown}
          ariaControls="naitive-unified-suggestions"
          dataTour="ask-ai"
          forceFocused={isOpen && !isMinimized}
          style={{ width: `${barWidth}px`, maxWidth: 'calc(100% - 32px)' }}
          onResizeStart={onResizeStart}
          onResizeDoubleClick={onResizeDoubleClick}
          onLogoClick={() => {
            if (isMinimized) expandPanel();
            else togglePanel();
          }}
          logoAriaLabel={isMinimized ? `Expand naitive AI${unreadCount > 0 ? ` (${unreadCount} new)` : ''}` : 'Open naitive AI'}
          logoOverlay={
            <>
              {isMinimized && isProcessing && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full animate-pulse" />
              )}
              {isMinimized && unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground shadow"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              {isMinimized && isProcessing && unreadCount === 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary animate-pulse"
                />
              )}
            </>
          }
        />
      </div>
    </div>
    {debug && debugView && createPortal(
      <div className="pointer-events-none fixed inset-0 z-[100000]">
        {/* Main content vertical center line */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${debugView.mainCenter}px`,
            width: '1px',
            background: 'rgba(56, 189, 248, 0.85)',
            boxShadow: '0 0 6px rgba(56,189,248,0.7)',
          }}
        />
        {/* Bar vertical center line */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${debugView.barCenter}px`,
            width: '1px',
            background: 'rgba(244, 114, 182, 0.85)',
            boxShadow: '0 0 6px rgba(244,114,182,0.7)',
          }}
        />
        {/* Main content bounds */}
        {debugRects && (
          <div
            className="absolute"
            style={{
              left: `${debugRects.main.left}px`,
              top: `${debugRects.main.top}px`,
              width: `${debugRects.main.width}px`,
              height: `${debugRects.main.height}px`,
              border: '1px dashed rgba(56,189,248,0.6)',
            }}
          />
        )}
        {/* Bar bounds */}
        {debugRects && (
          <div
            className="absolute"
            style={{
              left: `${debugRects.bar.left}px`,
              top: `${debugRects.bar.top}px`,
              width: `${debugRects.bar.width}px`,
              height: `${debugRects.bar.height}px`,
              border: '1px solid rgba(244,114,182,0.85)',
            }}
          />
        )}
        {/* HUD */}
        <div
          className="absolute top-3 right-3 rounded-md px-3 py-2 font-mono text-[11px] leading-snug"
          style={{
            background: 'rgba(8, 10, 18, 0.85)',
            color: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="font-sans text-[10px] uppercase tracking-wide text-white/55 mb-1">
            Bar Center Debug
          </div>
          <div>
            <span className="text-sky-400">main</span> center:{' '}
            {debugView.mainCenter.toFixed(1)}px
          </div>
          <div>
            <span className="text-pink-400">bar</span> center:{' '}
            {debugView.barCenter.toFixed(1)}px
          </div>
          <div>
            Δ:{' '}
            <span style={{
              color: Math.abs(debugView.delta) <= 1
                ? 'rgba(74, 222, 128, 0.95)'
                : Math.abs(debugView.delta) <= 4
                  ? 'rgba(250, 204, 21, 0.95)'
                  : 'rgba(248, 113, 113, 0.95)',
            }}>
              {debugView.delta >= 0 ? '+' : ''}{debugView.delta.toFixed(1)}px
            </span>
          </div>
          {debugRects && (
            <div className="text-white/50 mt-1">
              main: {debugRects.main.width.toFixed(0)}w · bar: {debugRects.bar.width.toFixed(0)}w
            </div>
          )}
          <div className="font-sans text-[10px] text-white/40 mt-1.5">
            ⇧⌘D to toggle
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
