import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { lazyRetry } from '@/lib/lazyRetry';

const Deals = lazy(lazyRetry(() => import('./Deals')));
const Lenders = lazy(lazyRetry(() => import('./Lenders')));
const EmailIntelligencePage = lazy(lazyRetry(() => import('./EmailIntelligencePage')));
const Company = lazy(lazyRetry(() => import('./Company')));
const Preferences = lazy(lazyRetry(() => import('./Preferences')));

type TabKey = 'deals' | 'lenders' | 'communications' | 'company' | 'preferences';

const TABS: Array<{ key: TabKey; label: string; Component: React.ComponentType<any> }> = [
  { key: 'deals', label: 'Deals', Component: Deals },
  { key: 'lenders', label: 'Funding Sources', Component: Lenders },
  { key: 'communications', label: 'Communications', Component: EmailIntelligencePage },
  { key: 'company', label: 'Company', Component: Company },
  { key: 'preferences', label: 'Preferences', Component: Preferences },
];

const isTabKey = (v: string | null): v is TabKey =>
  !!v && TABS.some((t) => t.key === v);

/**
 * Unified workspace shell: renders Deals, Funding Sources, Communications,
 * Company, and Preferences as tabs inside one route. Tabs are lazy-mounted
 * on first visit and kept alive after that (hidden via `display:none`) so
 * switching between them is instant and preserves in-page state.
 */
export default function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const active: TabKey = isTabKey(raw) ? raw : 'deals';

  // Track which tabs have been visited so we only mount them once needed
  // and then keep them alive for the rest of the session.
  const [mounted, setMounted] = useState<Set<TabKey>>(() => new Set([active]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const tabButtons = useMemo(
    () =>
      TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? 'border-primary/30 bg-primary/15 font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {active !== 'lenders' && (
        <div className="sticky top-0 z-20 border-b border-white/5 bg-transparent px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-1 overflow-x-auto">{tabButtons}</div>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        {TABS.map((t) => {
          if (!mounted.has(t.key)) return null;
          const isActive = t.key === active;
          const { Component } = t;
          return (
            <div
              key={t.key}
              className="absolute inset-0 overflow-auto"
              style={{ display: isActive ? 'block' : 'none' }}
              aria-hidden={!isActive}
            >
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <Component />
              </Suspense>
            </div>
          );
        })}
      </div>
    </div>
  );
}