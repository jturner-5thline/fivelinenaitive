import { AxisConfig, getField } from '../widgetTypes';
import { DropZone } from '../DropZone';
import { X } from 'lucide-react';

interface Props {
  config: AxisConfig;
  onChange: (c: AxisConfig) => void;
}

export function AxisConfigSection({ config, onChange }: Props) {
  const field = getField(config.fieldId);

  return (
    <div className="space-y-2">
      <DropZone id="drop-xaxis" label="X-Axis" accepts="date / dimension" isEmpty={!field}>
        {field && (
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium text-foreground">{field.name}</span>
            <button onClick={() => onChange({ ...config, fieldId: null })} className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </DropZone>
    </div>
  );
}
