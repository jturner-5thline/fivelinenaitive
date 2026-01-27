import { Save, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SettingsSaveBarProps {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReset?: () => void;
  position?: 'top' | 'bottom' | 'both';
  className?: string;
}

export function SettingsSaveBar({ 
  hasChanges, 
  isSaving, 
  onSave, 
  onReset,
  position = 'bottom',
  className 
}: SettingsSaveBarProps) {
  if (!hasChanges && !isSaving) return null;

  const bar = (
    <div className={cn(
      "flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg border",
      className
    )}>
      <p className="text-sm text-muted-foreground">
        {isSaving ? 'Saving changes...' : 'You have unsaved changes'}
      </p>
      <div className="flex items-center gap-2">
        {onReset && !isSaving && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
        <Button
          variant="gradient"
          size="sm"
          onClick={onSave}
          disabled={isSaving}
          className="gap-1.5"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );

  return bar;
}
