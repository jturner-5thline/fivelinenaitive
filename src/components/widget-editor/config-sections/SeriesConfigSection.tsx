import { SeriesConfig, getField } from '../widgetTypes';
import { DropZone } from '../DropZone';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  config: SeriesConfig;
  onChange: (c: SeriesConfig) => void;
}

export function SeriesConfigSection({ config, onChange }: Props) {
  const field = getField(config.fieldId);
  const displayName = field?.name ?? config.label ?? config.fieldId ?? 'Unknown';
  const hasField = !!config.fieldId;

  return (
    <div className="space-y-2">
      <DropZone id="drop-series" label="Data Series" accepts="dimension" isEmpty={!hasField}>
        {hasField && (
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium text-foreground">{displayName}</span>
            <button onClick={() => onChange({ ...config, fieldId: null, label: undefined })} className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </DropZone>

      {hasField && (
        <div className="pl-1">
          <Label className="text-xs text-muted-foreground mb-1 block">Mode</Label>
          <div className="flex gap-1">
            {(['single', 'many'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onChange({ ...config, mode: m })}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors',
                  config.mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
