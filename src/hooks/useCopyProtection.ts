import { useEffect } from 'react';

export const useCopyProtection = (enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled) return;

    // Disable right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Disable copy keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+C, Ctrl+A, Ctrl+U (view source), Ctrl+S, Ctrl+P
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'a', 'u', 's', 'p', 'x'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        return false;
      }
      // F12 (dev tools)
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
    };

    // Disable text selection via copy event
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      return false;
    };

    // Disable drag
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('dragstart', handleDragStart);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, [enabled]);
};
