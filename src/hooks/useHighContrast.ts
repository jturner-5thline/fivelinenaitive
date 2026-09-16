const STORAGE_KEY = 'a11y:high-contrast';
const CLASS_NAME = 'high-contrast';

/**
 * High contrast mode was retired platform-wide. Anyone who had switched it on
 * would otherwise stay locked in the theme with no control to turn it off, so
 * startup clears both the persisted flag and the class.
 */
export function clearHighContrast(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove(CLASS_NAME);
  }
}
