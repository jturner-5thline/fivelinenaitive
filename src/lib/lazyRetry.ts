/**
 * Wraps a dynamic import with two layers of resilience:
 *
 *   1. **In-memory retry**: if the first import attempt fails (often a
 *      transient network blip or stale HMR chunk URL during dev), retry
 *      once after a short delay without reloading the page.
 *   2. **Hard reload fallback**: if the retry also fails, perform a single
 *      `window.location.reload()` guarded by sessionStorage so we never
 *      reload-loop. The flag is cleared on the next successful load.
 *
 * This pattern is the standard remedy for the
 * `Failed to fetch dynamically imported module` error that appears when a
 * deploy or HMR update invalidates previously-served chunk URLs while a
 * tab is still open.
 */
const RELOAD_KEY = 'chunk_reload';

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk \d+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message)
  );
}

export function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return async () => {
    try {
      const mod = await factory();
      // Successful import — clear any stale reload flag from a prior session.
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* ignore — sessionStorage may be unavailable in some sandboxes */
      }
      return mod;
    } catch (firstError) {
      // Soft retry: only retry on the specific class of errors that
      // indicate a stale/missing chunk, not on real code-evaluation errors.
      if (!isChunkLoadError(firstError)) throw firstError;

      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const mod = await factory();
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          /* ignore */
        }
        return mod;
      } catch (secondError) {
        if (!isChunkLoadError(secondError)) throw secondError;

        // Hard reload fallback, guarded so we never reload-loop.
        let hasReloaded: string | null = null;
        try {
          hasReloaded = sessionStorage.getItem(RELOAD_KEY);
        } catch {
          /* ignore */
        }
        if (!hasReloaded) {
          try {
            sessionStorage.setItem(RELOAD_KEY, '1');
          } catch {
            /* ignore */
          }
          window.location.reload();
          // Return a never-resolving promise so React doesn't render the error
          // overlay during the reload.
          return new Promise<{ default: T }>(() => {});
        }
        // Already reloaded once and still failing — clear the flag and
        // surface the error so the ErrorBoundary can render a useful UI.
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          /* ignore */
        }
        throw secondError;
      }
    }
  };
}
