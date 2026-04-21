import { create } from 'zustand';

export interface WidgetCarouselEntry {
  id: string;
  label: string;
}

interface WidgetCarouselState {
  isOpen: boolean;
  activeIndex: number;
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
  order: [],
  triggerEl: null,

  setOrder: (order) => set({ order }),

  openWidget: (id, triggerEl) => {
    const { order } = get();
    const idx = order.findIndex((w) => w.id === id);
    if (idx < 0) return;
    set({ isOpen: true, activeIndex: idx, triggerEl: triggerEl ?? null });
  },

  close: () => {
    const { triggerEl } = get();
    set({ isOpen: false });
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
    const { activeIndex, order } = get();
    if (activeIndex < order.length - 1) set({ activeIndex: activeIndex + 1 });
  },

  prev: () => {
    const { activeIndex } = get();
    if (activeIndex > 0) set({ activeIndex: activeIndex - 1 });
  },

  goTo: (index) => {
    const { order } = get();
    if (index >= 0 && index < order.length) set({ activeIndex: index });
  },
}));