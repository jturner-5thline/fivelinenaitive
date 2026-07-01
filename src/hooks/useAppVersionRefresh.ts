import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (import.meta.env.DEV) return;

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
        notifiedRef.current = true;
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
  }, []);
}

export function AppVersionRefreshMount() {
  useAppVersionRefresh();
  return null;
}