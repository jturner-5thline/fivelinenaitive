import { cn } from '@/lib/utils';
import { Loader2, Palette } from 'lucide-react';

interface GammaTheme {
  id: string;
  name: string;
  type: string;
}

interface GammaThemeGridProps {
  themes: GammaTheme[];
  selected: string;
  onChange: (id: string) => void;
  isLoading: boolean;
}

const THEME_COLORS: Record<string, string> = {};

function getThemeGradient(name: string, index: number) {
  const gradients = [
    'from-purple-500/20 to-blue-500/20',
    'from-pink-500/20 to-orange-500/20',
    'from-emerald-500/20 to-cyan-500/20',
    'from-amber-500/20 to-red-500/20',
    'from-indigo-500/20 to-violet-500/20',
    'from-teal-500/20 to-lime-500/20',
    'from-rose-500/20 to-fuchsia-500/20',
    'from-sky-500/20 to-blue-500/20',
  ];
  return gradients[index % gradients.length];
}

export function GammaThemeGrid({ themes, selected, onChange, isLoading }: GammaThemeGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">Loading themes...</span>
      </div>
    );
  }

  const allThemes = [{ id: 'default', name: 'Default', type: 'built-in' }, ...themes];

  return (
    <div className="grid grid-cols-3 gap-2">
      {allThemes.map((theme, i) => {
        const isActive = selected === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onChange(theme.id)}
            className={cn(
              'group relative flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all duration-150',
              isActive
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border hover:border-primary/40 hover:bg-muted/30'
            )}
          >
            <div
              className={cn(
                'h-8 w-full rounded-md bg-gradient-to-br',
                getThemeGradient(theme.name, i)
              )}
            />
            <span className={cn('text-[11px] font-medium truncate max-w-full', isActive ? 'text-foreground' : 'text-muted-foreground')}>
              {theme.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
