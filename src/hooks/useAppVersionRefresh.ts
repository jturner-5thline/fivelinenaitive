import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const DEMO_EMAILS = new Set(['demo@example.com', 'demo@5thline.co']);

/**
 * Detects when a new build has been published and prompts the user to
 * reload so they see the latest version.
 *
 * How it works:
 *   1. On mount, fetches `/index.html` with `cache: 'no-store'` and hashes
 *      the response body. This is our baseline "current build fingerprint".
 *   2. Every `INTERVAL_MS` (and whenever the tab becomes visible again),
 *      re-fetches `/index.html` and re-hashes it. If the fingerprint
 *      changes, a new build is live on Lovable hosting.
 *   3. Shows a persistent Sonner toast with a "Reload" action that
 *      hard-refreshes the page (bypassing SW / HTTP caches).
 *
 * Notes:
 *   - `index.html` is the perfect signal because Vite emits fresh
 *     hashed asset URLs into it on every build, so any deploy changes
 *     the file's bytes.
 *   - We deliberately do NOT auto-reload — that would interrupt users
 *     mid-flow. The toast is dismissable and re-appears on the next
 *     poll if the user ignores it.
 *   - Skipped entirely in dev (Vite serves a transformed index.html
 *     that changes on every request, which would spam reloads).
 */
const INTERVAL_MS = 60_000; // poll once a minute
const TOAST_ID = 'app-version-update';
/** Per-user suppression window: don't re-prompt about a new version more than once per day. */
const SUPPRESS_MS = 24 * 60 * 60 * 1000;
const SUPPRESS_KEY = 'app-version-refresh:last-shown';

function wasRecentlyShown(): boolean {
  try {
    const raw = window.localStorage.getItem(SUPPRESS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SUPPRESS_MS;
  } catch {
    return false;
  }
}

function markShown() {
  try {
    window.localStorage.setItem(SUPPRESS_KEY, String(Date.now()));
  } catch {
    // ignore — storage unavailable
  }
}

async function fingerprintIndexHtml(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?_v=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Cheap non-crypto hash (djb2) — good enough to detect ANY byte change.
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) + h) ^ text.charCodeAt(i);
    }
    return String(h >>> 0);
  } catch {
    return null;
  }
}

function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      });
    }
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})));
    }
  } catch {
    // ignore — best effort
  }
  // Use a cache-busting query param so browsers refetch index.html
  // even if HTTP caching would otherwise serve the old copy.
  const url = new URL(window.location.href);
  url.searchParams.set('_v', String(Date.now()));
  window.location.replace(url.toString());
}

export function useAppVersionRefresh() {
  const baselineRef = useRef<string | null>(null);
  const notifiedRef = useRef(false);
  const { user } = useAuth();
  const isDemoUser = !!user?.email && DEMO_EMAILS.has(user.email.toLowerCase());

  useEffect(() => {
    if (import.meta.env.DEV) return;
    // Never nag demo accounts about new versions — they're for exploration
    // and interrupting them with a reload prompt breaks the demo flow.
    if (isDemoUser) return;

    let cancelled = false;
    let timer: number | undefined;

    const check = async () => {
      const fp = await fingerprintIndexHtml();
      if (cancelled || !fp) return;
      if (baselineRef.current == null) {
        baselineRef.current = fp;
        return;
      }
      if (fp !== baselineRef.current && !notifiedRef.current) {
        // Only prompt once per 24h per browser, even across reloads that
        // pick up newer builds — avoids nagging users on every deploy.
        if (wasRecentlyShown()) {
          notifiedRef.current = true;
          return;
        }
        notifiedRef.current = true;
        markShown();
        toast.message('A new version of naitive is available', {
          id: TOAST_ID,
          description: 'Reload to get the latest updates.',
          duration: Infinity,
          action: {
            label: 'Reload',
            onClick: () => hardReload(),
          },
        });
      }
    };

    // Capture baseline immediately, then poll.
    check();
    timer = window.setInterval(check, INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isDemoUser]);
}

export function AppVersionRefreshMount() {
  useAppVersionRefresh();
  return null;
}