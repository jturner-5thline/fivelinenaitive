import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canSeeNikiBriefing, NIKI_EMAIL } from '@/constants/nikiBriefing';

export interface CarouselWidgetEntry {
  id: string;
  label: string;
}

/**
 * Returns the ordered list of dashboard quick-action carousel widgets the
 * current user has access to. Single source of truth used by both the
 * Dashboard page (to register the carousel order) and the AppSidebar
 * (to render the Dashboard flyout submenu).
 */
export function useDashboardCarouselWidgets(): CarouselWidgetEntry[] {
  const { user } = useAuth();
  const isJTurner = user?.email === 'jturner@5thline.co';
  const canSeeNiki = canSeeNikiBriefing(user?.email);
  const isNikiViewingHerself = user?.email?.toLowerCase() === NIKI_EMAIL;
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;

  return useMemo(() => {
    const entries: CarouselWidgetEntry[] = [
      { id: 'calendar', label: 'Calendar' },
      { id: 'email', label: 'Email' },
      { id: 'new-deal', label: 'New Deal' },
    ];
    if (isJTurner) entries.push({ id: 'daily-briefing', label: 'Daily Rundown' });
    if (canSeeNiki) {
      entries.push({
        id: 'niki-briefing',
        label: isNikiViewingHerself ? 'My Daily Rundown' : "Niki's Daily Rundown",
      });
    }
    if (is5thLine) {
      entries.push({ id: 'deal-rundown', label: 'Deal Rundown' });
    }
    return entries;
  }, [isJTurner, canSeeNiki, isNikiViewingHerself, is5thLine]);
}