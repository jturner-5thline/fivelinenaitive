import { useWidgetCarouselStore } from '@/stores/widgetCarouselStore';

/**
 * Returns a className to apply to the active widget's <DialogContent>
 * so it slides in from the navigation direction instead of using the
 * default Radix zoom/fade. The chrome (arrows, header, backdrop) stays
 * fixed because it lives in a separate portal.
 *
 * Returns '' on the very first open (no direction yet) so the original
 * dialog open animation runs unchanged.
 */
export function useCarouselSwipeClass(): string {
  const direction = useWidgetCarouselStore((s) => s.direction);
  if (direction === 1) return 'widget-swipe-from-right';
  if (direction === -1) return 'widget-swipe-from-left';
  return '';
}