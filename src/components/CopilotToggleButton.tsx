import { useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Building2,
  ArrowRight,
  CornerDownLeft,
  User,
  CheckSquare,
} from 'lucide-react';
import { useCopilotStore } from '@/stores/copilotStore';
import { useQuickFind } from '@/hooks/useQuickFind';
import { useAnyDialogOpen } from '@/hooks/useAnyDialogOpen';
import { useDealsContext } from '@/contexts/DealsContext';
import { useLenders } from '@/contexts/LendersContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useAiDealFilterStore } from '@/stores/aiDealFilterStore';
import { naturalLanguageToDealFilter } from '@/lib/naturalLanguageToDealFilter';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { cn } from '@/lib/utils';
// Lazy-load the (~109KB) AI copilot panel chunk so it doesn't block
// initial render on every page. The panel returns null until isOpen, so
// gating mount on isOpen|isMinimized|hovered keeps behavior identical
// while removing the chunk parse from the critical path.
const loadAICopilotPanel = () =>
  import('@/components/AICopilotPanel').then((m) => ({ default: m.AICopilotPanel }));
const AICopilotPanel = lazy(loadAICopilotPanel);
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
  | { kind: 'contact'; id: string; label: string; sublabel?: string; path: string }
  | { kind: 'crm-company'; id: string; label: string; sublabel?: string; path: string }
  | { kind: 'task'; id: string; label: string; sublabel?: string; path: string }
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
  const selectedAgent = useCopilotStore((s) => s.selectedAgent);
  // NOTE: we intentionally no longer early-return when a modal/sheet/drawer
  // is open. The Ask naitive AI bar is a global top-layer assist surface
  // and must remain visible & interactive above every overlay (deal
  // popups, task popups, dialogs, sheets, dropdowns, popovers, command
  // menus, expanded workspaces). We keep this hook around only so the
  // debug overlay re-measures when modals open/close.
  const hasOpenModal = useAnyDialogOpen();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Most recently submitted prompt — used by ArrowUp to recall the
  // previous query when the input is empty (terminal-style history).
  const [lastSentPrompt, setLastSentPrompt] = useState<string>('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { deals } = useDealsContext();
  const { lenders } = useLenders();
  const { pipelines } = usePipelineContext();
  const dealTypesCtx = (() => { try { return useDealTypes(); } catch { return null; } })();
  const location = useLocation();
  const setRules = useAiDealFilterStore((s) => s.setRules);
  const addRules = useAiDealFilterStore((s) => s.addRules);
  const clearAi = useAiDealFilterStore((s) => s.clear);
  const setTranslating = useAiDealFilterStore((s) => s.setTranslating);
  const setClarification = useAiDealFilterStore((s) => s.setClarification);
  const { results: quickFind } = useQuickFind(value);

  // ── Persisted bar width ────────────────────────────────────────────────
  // The user can drag the left edge of the bar to resize it. The pixel
  // width is persisted to localStorage so the layout stays consistent
  // across sessions and routes.
  const BAR_WIDTH_KEY = 'naitive:bar-width';
  const BAR_WIDTH_MIN = 280;
  const BAR_WIDTH_MAX = 960;
  const BAR_WIDTH_DEFAULT = 402;
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

  // ── Align bar center with the active <main> content area ───────────────
  // The bar is portal-mounted to <body> and centered on the viewport. When
  // the active page lives inside an offset container (e.g. the deal
  // overlay modal which is inset from the viewport, or any layout whose
  // <main> is shifted by a sidebar / scrollbar), centering on the
  // viewport produces a visible horizontal offset between the page header
  // content and this bar. Track the visible <main> element and shift the
  // bar so its center matches the main's center.
  const [centerOffset, setCenterOffset] = useState(0);
  useEffect(() => {
    const findActiveMain = (): HTMLElement | null => {
      const mains = Array.from(document.querySelectorAll('main')) as HTMLElement[];
      const visible = mains.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (visible.length === 0) return null;
      // Prefer a <main> that lives inside an open dialog / modal overlay —
      // those are painted on top of the regular page shell and are what
      // the user is actually looking at.
      const inDialog = visible.find((el) =>
        el.closest('[role="dialog"], [aria-modal="true"]') != null,
      );
      if (inDialog) return inDialog;
      // Otherwise fall back to the last-rendered (top-most in DOM order)
      // visible main — this is the active route's main content area.
      return visible[visible.length - 1];
    };

    const update = () => {
      const mainEl = findActiveMain();
      if (!mainEl) {
        setCenterOffset(0);
        return;
      }
      const r = mainEl.getBoundingClientRect();
      const mainCenter = r.left + r.width / 2;
      const viewportCenter = window.innerWidth / 2;
      setCenterOffset(Math.round(mainCenter - viewportCenter));
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    // Throttled body-mutation observer. The previous implementation
    // fired `update` on every childList mutation in the whole subtree
    // (tooltips opening, dropdowns mounting, virtual list scroll), which
    // showed up as continuous getBoundingClientRect churn in long
    // sessions. Coalesce to a single rAF and skip while the tab is
    // hidden — `update` only matters when the user is actually looking.
    let moScheduled = false;
    const scheduleUpdate = () => {
      if (moScheduled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      moScheduled = true;
      requestAnimationFrame(() => {
        moScheduled = false;
        update();
      });
    };
    const mo = new MutationObserver(scheduleUpdate);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    // Backup poll catches transitions the observers miss (sidebar
    // collapse animation, etc.). Pause while the tab is hidden so a
    // backgrounded tab stays at 0% CPU.
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      update();
    }, 400);
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', update);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

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
        // Warm the lazy panel chunk before the open animation runs.
        void loadAICopilotPanel();
        if (e.key === 'j' && isOpen) {
          togglePanel();
        } else {
          // Force-expand the pill first so the textarea exists, then focus.
          setHovered(true);
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel, isOpen]);

  // Idle-time preload of the AI copilot panel chunk so first-ever open
  // (via ⌘J, click, or programmatic) doesn't pay the chunk parse cost.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const schedule = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 800));
    const handle = schedule(() => { void loadAICopilotPanel(); });
    return () => {
      const cancel = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
        ?? ((h: number) => window.clearTimeout(h));
      cancel(handle as number);
    };
  }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const out: Suggestion[] = [];

    const resolveStageLabel = (stage: string, pipelineId?: string | null) => {
      const pipeline = pipelineId
        ? pipelines.find((p) => p.id === pipelineId)
        : undefined;
      const match = pipeline?.stages?.find(
        (s) => s.id === stage || s.label === stage,
      );
      return match?.label ?? stage;
    };

    if (deals?.length) {
      let count = 0;
      for (const d of deals) {
        const company = (d.company || '').toLowerCase();
        const client = ((d as any).client || '').toLowerCase();
        if (!company && !client) continue;
        if (company.includes(q) || client.includes(q)) {
          out.push({
            kind: 'deal',
            id: d.id,
            label: d.company,
            sublabel: resolveStageLabel(d.stage, d.pipelineId),
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

    for (const c of quickFind.crmCompanies) {
      out.push({
        kind: 'crm-company',
        id: c.id,
        label: c.name,
        sublabel: c.sublabel,
        path: `/crm-companies/${c.id}`,
      });
    }

    for (const c of quickFind.contacts) {
      out.push({
        kind: 'contact',
        id: c.id,
        label: c.name,
        sublabel: c.sublabel,
        path: `/contacts/${c.id}`,
      });
    }

    for (const t of quickFind.tasks) {
      out.push({
        kind: 'task',
        id: t.id,
        label: t.title,
        sublabel: t.sublabel,
        path: `/tasks/${t.id}`,
      });
    }

    const pages = QUICK_PAGES.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
    for (const p of pages) {
      out.push({ kind: 'page', id: p.path, label: p.name, path: p.path });
    }

    return out.slice(0, 16);
  }, [value, deals, lenders, pipelines, quickFind]);

  // Default the highlighted row to the top real result (index 1) so
  // pressing Enter navigates directly to the best match. When there are
  // no suggestions yet, fall back to the AI row at index 0.
  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 1 : 0);
  }, [value, suggestions.length]);

  // (Previously: `if (hasOpenModal) return null;` — removed so the bar
  // floats above all overlays. Its portal sits on <body> with
  // z-[2147483000], which is above dialog overlays (1300), dialog content
  // (1310), popovers/dropdowns (1340), and any app-level overlay layer.)

  const askAi = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLastSentPrompt(trimmed);
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
    setLastSentPrompt(text);
    askAi(text);
  };

  const showDropdown = focused && value.trim().length > 0;
  const aiIntent = isAiIntent(value);
  const dropdownItemCount = suggestions.length + 1; // +1 for the AI row at index 0

  // Compact idle pill: when the user isn't interacting with the bar and
  // there's no in-flight value/panel, collapse to a small icon-only pill.
  const collapsed =
    !hovered &&
    !focused &&
    !value &&
    (!isOpen || isMinimized) &&
    !demoMode;

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
    {createPortal(
    <div
      aria-hidden={false}
      // Top-of-app z-index. Deliberately set near the max 32-bit int so no
      // app-level overlay can stack above the Ask naitive AI bar. Only true
      // browser-system surfaces (native autofill, devtools) sit above this.
      className="pointer-events-none fixed inset-x-0 z-[2147483000] flex justify-center"
      style={{
        bottom: 'calc(44px + max(16px, env(safe-area-inset-bottom)))',
      }}
    >
      <div
        className="pointer-events-auto flex flex-col items-center gap-2"
        data-copilot-root=""
        style={{
          width: collapsed ? 'auto' : `min(${barWidth}px, calc(100% - 32px))`,
          transform: centerOffset ? `translateX(${centerOffset}px)` : undefined,
        }}
        onMouseEnter={() => {
          if (collapseTimerRef.current) {
            window.clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
          }
          setHovered(true);
          // Warm the lazy AICopilotPanel chunk on first hover so the
          // first ⌘J / click → open path doesn't pay the chunk parse.
          void loadAICopilotPanel();
        }}
        onMouseLeave={() => {
          if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = window.setTimeout(() => {
            setHovered(false);
          }, 250);
        }}
      >
        {/* AI transcript panel — lazy. Only mount once the user has
            opened the panel (or is hovering the Ask bar, which warms the
            chunk so the first ⌘J / click is instant). Pre-mount, the
            panel rendered null anyway, so this is behavior-preserving. */}
        {(isOpen || isMinimized || hovered) && (
          <Suspense fallback={null}>
            <AICopilotPanel />
          </Suspense>
        )}
        {collapsed && (
            <button
              type="button"
              role="button"
              aria-label="Ask naitive AI"
              title="Ask naitive AI (⌘K)"
              onClick={() => {
                setHovered(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              onFocus={() => setHovered(true)}
              className={cn(
                'group pointer-events-auto flex items-center justify-center',
                'relative h-6 w-[52px] rounded-full cursor-pointer',
                'transition-[transform,box-shadow,opacity] duration-200 ease-out',
                'motion-reduce:transition-none',
                'hover:scale-[1.04] focus-visible:scale-[1.04]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                'animate-in fade-in duration-150 motion-reduce:animate-none',
              )}
              style={{
                // One step lighter than the platform's dark shark bg —
                // same gradient family, just brighter so the dark icon
                // reads with high contrast without going white.
                // Stays one clear step brighter than the (now-brighter)
                // card/popover surfaces so the dark icon still pops.
                background:
                  'linear-gradient(145deg, hsl(230 32% 36%) 0%, hsl(232 36% 42%) 50%, hsl(240 44% 48%) 80%, hsl(220 60% 54%) 100%)',
                backdropFilter: 'blur(18px) saturate(1.5)',
                WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
                border: '1.5px solid rgba(200, 228, 255, 0.85)',
                boxShadow:
                  '0 12px 32px rgba(0, 0, 0, 0.58), 0 2px 10px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(160, 200, 255, 0.34), 0 0 26px rgba(160, 200, 255, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.38)',
              }}
            >
              <img
                src={naitiveAiIcon}
                alt=""
                aria-hidden="true"
                className="h-5 w-5"
                style={{ filter: 'brightness(1.16) contrast(1.05)' }}
              />
              {(!isOpen || isMinimized) && unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground shadow"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
        )}
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
                <img
                  src={naitiveAiIcon}
                  alt=""
                  className="h-3.5 w-3.5"
                  style={{ filter: 'brightness(1.16) contrast(1.05)' }}
                />
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
                s.kind === 'deal'
                  ? Briefcase
                  : s.kind === 'lender' || s.kind === 'crm-company'
                    ? Building2
                    : s.kind === 'contact'
                      ? User
                      : s.kind === 'task'
                        ? CheckSquare
                        : ArrowRight;
              const groupLabel =
                s.kind === 'deal'
                  ? 'Deal'
                  : s.kind === 'lender'
                    ? 'Lender'
                    : s.kind === 'crm-company'
                      ? 'Company'
                      : s.kind === 'contact'
                        ? 'Contact'
                        : s.kind === 'task'
                          ? 'Task'
                          : 'Page';
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

        <div className={cn(collapsed && 'hidden')}>
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
            } else if (!showDropdown && e.key === 'ArrowUp' && !value && lastSentPrompt) {
              // Recall the previous prompt when the input is empty and no
              // suggestion dropdown is showing — terminal-style history.
              e.preventDefault();
              setValue(lastSentPrompt);
            }
          }}
          readOnly={demoMode}
          disabled={demoMode}
          placeholder={demoMode ? 'Demo running — sample prompt' : 'Search or ask naitive AI…'}
          ariaExpanded={showDropdown}
          ariaControls="naitive-unified-suggestions"
          dataTour="ask-ai"
          forceFocused={isOpen && !isMinimized}
          activeAgentLabel={selectedAgent?.name || 'Ask naitive'}
          activeAgentEmoji={selectedAgent?.emoji}
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
              {(!isOpen || isMinimized) && unreadCount > 0 && (
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
    </div>,
    document.body)}
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
