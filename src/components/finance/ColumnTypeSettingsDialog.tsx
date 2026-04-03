import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings2, BarChart3, TrendingUp } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PeriodColumn } from '@/hooks/useFinanceDataRange';
import { ColumnType, defaultColumnType } from '@/hooks/useColumnSettings';
import { cn } from '@/lib/utils';

interface ColumnTypeSettingsDialogProps {
  periodColumns: PeriodColumn[];
  getColumnType: (columnKey: string, endDate: Date) => ColumnType;
  onSave: (updates: { columnKey: string; columnType: ColumnType }[]) => Promise<void>;
}

export function ColumnTypeSettingsDialog({
  periodColumns,
  getColumnType,
  onSave,
}: ColumnTypeSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [localTypes, setLocalTypes] = useState<Record<string, ColumnType>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local state from current settings when dialog opens
  useEffect(() => {
    if (open) {
      const types: Record<string, ColumnType> = {};
      periodColumns.forEach(col => {
        types[col.label] = getColumnType(col.label, col.endDate);
      });
      setLocalTypes(types);
    }
  }, [open, periodColumns, getColumnType]);

  const handleSave = async () => {
    setIsSaving(true);
    const updates = Object.entries(localTypes || {}).map(([columnKey, columnType]) => ({
      columnKey,
      columnType,
    }));
    await onSave(updates);
    setIsSaving(false);
    setOpen(false);
  };

  const setAllTo = (type: ColumnType) => {
    const updated: Record<string, ColumnType> = {};
    periodColumns.forEach(col => { updated[col.label] = type; });
    setLocalTypes(updated);
  };

  const resetToDefaults = () => {
    const defaults: Record<string, ColumnType> = {};
    periodColumns.forEach(col => {
      defaults[col.label] = defaultColumnType(col.endDate);
    });
    setLocalTypes(defaults);
  };

  // Find the boundary index where projection starts
  const projectionStartIdx = periodColumns.findIndex(col => localTypes[col.label] === 'projection');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5">
          <Settings2 className="h-3 w-3" />
          Column Types
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Configure Actuals vs Projections
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mark each column as <strong>Actual</strong> or <strong>Projection</strong>. Projection columns will be visually distinguished in the table.
          </p>

          {/* Quick actions */}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAllTo('actual')}>
              All Actuals
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAllTo('projection')}>
              All Projections
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={resetToDefaults}>
              Reset to Defaults
            </Button>
          </div>

          {/* Column list */}
          <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1">
            {periodColumns.map((col, idx) => {
              const colType = localTypes[col.label] || 'actual';
              const isProjection = colType === 'projection';

              return (
                <div
                  key={col.label}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-md border transition-colors",
                    isProjection
                      ? "border-accent bg-accent/10"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isProjection ? (
                      <TrendingUp className="h-3.5 w-3.5 text-accent-foreground" />
                    ) : (
                      <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{col.shortLabel}</span>
                    <span className="text-xs text-muted-foreground">{col.label}</span>
                  </div>

                  <ToggleGroup
                    type="single"
                    value={colType}
                    onValueChange={(v) => {
                      if (v) setLocalTypes(prev => ({ ...prev, [col.label]: v as ColumnType }));
                    }}
                    className="gap-0"
                  >
                    <ToggleGroupItem
                      value="actual"
                      className="text-xs h-7 px-2.5 rounded-r-none data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      Actual
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="projection"
                      className="text-xs h-7 px-2.5 rounded-l-none data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                    >
                      Proj
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
