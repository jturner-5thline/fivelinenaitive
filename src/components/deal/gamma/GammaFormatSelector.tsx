import { Presentation, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GammaFormatSelectorProps {
  value: 'presentation' | 'document';
  onChange: (value: 'presentation' | 'document') => void;
}

const formats = [
  {
    value: 'presentation' as const,
    label: 'Presentation',
    description: 'Visual slides with auto-layout',
    icon: Presentation,
  },
  {
    value: 'document' as const,
    label: 'Document',
    description: 'Structured long-form content',
    icon: FileText,
  },
];

export function GammaFormatSelector({ value, onChange }: GammaFormatSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {formats.map((fmt) => {
        const isActive = value === fmt.value;
        return (
          <button
            key={fmt.value}
            type="button"
            onClick={() => onChange(fmt.value)}
            className={cn(
              'group relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all duration-200',
              isActive
                ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            )}
          >
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground'
              )}
            >
              <fmt.icon className="h-6 w-6" />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-semibold', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {fmt.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmt.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
