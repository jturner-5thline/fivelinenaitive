/**
 * Tiny IndexedDB wrapper used to persist the master lenders directory
 * between page loads. The in-memory cache in `useMasterLenders` already
 * keeps re-mounts instant within a single session — this layer is what
 * makes the very first paint of `/lenders` (or any page that needs the
 * full directory) feel instant on cold loads / hard refresh by hydrating
 * from disk before the network round-trip finishes.
 *
 * Data shape stored: { userId, savedAt, lenders }. We key all reads on
 * userId so signed-out users never see another user's snapshot.
 */

const DB_NAME = 'naitive_cache_v1';
const STORE_NAME = 'lender_directory';
const RECORD_KEY = 'snapshot';

export interface LenderCacheSnapshot<T = unknown> {
  userId: string;
  savedAt: number;
  lenders: T[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCachedLenders<T = unknown>(userId: string): Promise<LenderCacheSnapshot<T> | null> {
  try {
    const db = await openDb();
    return await new Promise<LenderCacheSnapshot<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => {
        const v = req.result as LenderCacheSnapshot<T> | undefined;
        if (!v || v.userId !== userId || !Array.isArray(v.lenders)) {
          resolve(null);
        } else {
          resolve(v);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveCachedLenders<T = unknown>(userId: string, lenders: T[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const payload: LenderCacheSnapshot<T> = { userId, savedAt: Date.now(), lenders };
      const req = store.put(payload, RECORD_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Quota errors, private mode, etc. — fail soft; we still have the
    // in-memory cache and the network.
  }
}

export async function clearCachedLenders(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
}