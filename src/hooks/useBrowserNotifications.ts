import { useState, useEffect, useCallback } from 'react';
import { startVisibilityAwareInterval } from '@/lib/visibilityAwareInterval';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as PermissionState;
  });

  // Listen for permission changes
  useEffect(() => {
    if (!('Notification' in window)) return;

    // Some browsers support the permissionchange event
    const updatePermission = () => {
      setPermission(Notification.permission as PermissionState);
    };

    // Previously polled `Notification.permission` every 2s for the entire
    // session — wasted work for a value that almost never changes after
    // page load. Now: poll at 30s, pause when the tab is hidden, and
    // re-check on tab focus (which is when the user typically grants /
    // revokes the permission in another tab anyway).
    return startVisibilityAwareInterval(updatePermission, 30_000);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      return result === 'granted';
    } catch {
      return false;
    }
  }, []);

  const isSupported = permission !== 'unsupported';
  const isGranted = permission === 'granted';
  const isDenied = permission === 'denied';

  return {
    permission,
    isSupported,
    isGranted,
    isDenied,
    requestPermission,
  };
}

/**
 * Send a browser desktop notification.
 * Safe to call even if permission isn't granted — it will silently no-op.
 */
export function sendDesktopNotification(
  title: string,
  options?: NotificationOptions & { onClick?: () => void }
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      icon: '/favicon.png',
      badge: '/favicon.png',
      ...options,
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    // Auto-close after 8 seconds
    setTimeout(() => notification.close(), 8000);
  } catch (e) {
    // Service worker context or other restriction — silently ignore
    console.log('Desktop notification not available:', e);
  }
}
