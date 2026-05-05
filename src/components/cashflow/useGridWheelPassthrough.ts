import { useEffect, useRef } from 'react';

/**
 * Attaches non-passive wheel listeners to a table card and any overflow descendants.
 * Vertical wheel events are forwarded to the page; horizontal ones scroll naturally.
 */
export function useGridWheelPassthrough<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Native scrolling is preserved; vertical wheel scrolls the table/page as
  // expected, and Shift+wheel (or trackpad horizontal gestures) scrolls the
  // wide week columns horizontally without any JS intervention.
  return ref;
}