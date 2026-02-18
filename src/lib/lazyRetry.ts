/**
 * Wraps a dynamic import with a retry that reloads the page once
 * if the chunk fails to load (stale hash after deploy).
 */
export function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return () =>
    factory().catch((error: Error) => {
      const key = 'chunk_reload';
      const hasReloaded = sessionStorage.getItem(key);
      if (!hasReloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render the error
        return new Promise<{ default: T }>(() => {});
      }
      sessionStorage.removeItem(key);
      throw error;
    });
}
