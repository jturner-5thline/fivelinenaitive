import { useState, useEffect, useCallback } from 'react';

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

    // Poll briefly after requesting (some browsers don't fire events)
    const interval = setInterval(updatePermission, 2000);
    return () => clearInterval(interval);
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
