import { create } from 'zustand';

export interface WidgetCarouselEntry {
  id: string;
  label: string;
}

interface WidgetCarouselState {
  isOpen: boolean;
  activeIndex: number;
  /** Direction of the most recent navigation: 1 = next (slide left→), -1 = prev (slide ←right), 0 = none. */
  direction: number;
  /** Bumps on every navigation so animation classes can re-trigger via key. */
  navTick: number;
  /** Order of carousel widgets currently registered (set by Dashboard). */
  order: WidgetCarouselEntry[];
  /** Element to return focus to when the modal closes. */
  triggerEl: HTMLElement | null;

  setOrder: (order: WidgetCarouselEntry[]) => void;
  openWidget: (id: string, triggerEl?: HTMLElement | null) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

export const useWidgetCarouselStore = create<WidgetCarouselState>((set, get) => ({
  isOpen: false,
  activeIndex: 0,
  direction: 0,
  navTick: 0,
  order: [],
  triggerEl: null,

  setOrder: (order) => set({ order }),

  openWidget: (id, triggerEl) => {
    const { order } = get();
    const idx = order.findIndex((w) => w.id === id);
    if (idx < 0) return;
    set({ isOpen: true, activeIndex: idx, triggerEl: triggerEl ?? null, direction: 0 });
  },

  close: () => {
    const { triggerEl } = get();
    set({ isOpen: false, direction: 0 });
    // Return focus to the original trigger (after the modal unmounts)
    if (triggerEl && typeof triggerEl.focus === 'function') {
      requestAnimationFrame(() => {
        try {
          triggerEl.focus();
        } catch {
          /* noop */
        }
      });
    }
  },

  next: () => {
    const { activeIndex, order, navTick } = get();
    if (activeIndex < order.length - 1) {
      set({ activeIndex: activeIndex + 1, direction: 1, navTick: navTick + 1 });
    }
  },

  prev: () => {
    const { activeIndex, navTick } = get();
    if (activeIndex > 0) {
      set({ activeIndex: activeIndex - 1, direction: -1, navTick: navTick + 1 });
    }
  },

  goTo: (index) => {
    const { order, activeIndex, navTick } = get();
    if (index >= 0 && index < order.length && index !== activeIndex) {
      const direction = index > activeIndex ? 1 : -1;
      set({ activeIndex: index, direction, navTick: navTick + 1 });
    }
  },
}));