import { cn } from '@/lib/utils';

const BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap border';

const NEUTRAL =
  'bg-muted/50 text-muted-foreground border-border/60';

const VARIANTS: Record<string, string> = {
  prospect:
    'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 dark:text-emerald-300',
  lender:
    'bg-sky-500/10 text-sky-300 border-sky-500/20 dark:text-sky-300',
  '5th line stakeholder':
    'bg-violet-500/10 text-violet-300 border-violet-500/20 dark:text-violet-300',
};

export function contactTypeBadgeClass(type?: string | null): string {
  const key = (type || '').trim().toLowerCase();
  return cn(BASE, VARIANTS[key] ?? NEUTRAL);
}