import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FunctionSquare, Database, FileText, X, Calendar } from 'lucide-react';
import type { CellConfig } from './useCellConfig';

interface Props {
  config: CellConfig;
  rowLabel: string;
  colLabel: string;
  value: string;
  onClose: () => void;
}

export function CellInspector({ config, rowLabel, colLabel, value, onClose }: Props) {
  const typeIcon = config.cell_type === 'formula'
    ? <FunctionSquare className="h-3.5 w-3.5 text-emerald-400" />
    : config.cell_type === 'qbo_metric'
    ? <Database className="h-3.5 w-3.5 text-blue-400" />
    : <FileText className="h-3.5 w-3.5 text-muted-foreground" />;

  const typeBadge = config.cell_type === 'formula'
    ? <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-[9px] px-1.5 py-0">Formula</Badge>
    : config.cell_type === 'qbo_metric'
    ? <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-[9px] px-1.5 py-0">QBO</Badge>
    : <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Static</Badge>;

  return (
    <div className="w-72 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            {typeIcon}
            <span className="text-xs font-semibold text-foreground">{rowLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {typeBadge}
            <span className="text-[10px] text-muted-foreground">{colLabel}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Separator />

      {/* Current Value */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-0.5">Current Value</div>
        <div className="text-sm font-mono font-semibold text-foreground">{value}</div>
      </div>

      {/* Cell type specific details */}
      {config.cell_type === 'formula' && config.formula_string && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Formula</div>
          <div className="bg-muted/50 rounded px-2 py-1.5 font-mono text-[10px] text-emerald-400 border border-border/50">
            {config.formula_string}
          </div>
        </div>
      )}

      {config.cell_type === 'qbo_metric' && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Source</div>
            <div className="flex items-center gap-1.5">
              <Database className="h-3 w-3 text-blue-400" />
              <span className="text-xs text-foreground font-medium">QuickBooks Online</span>
            </div>
          </div>

          {config.qbo_entity && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">Entity</div>
              <div className="text-xs text-foreground">{config.qbo_entity}</div>
            </div>
          )}

          {config.qbo_account && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">Account</div>
              <div className="text-xs text-foreground">{config.qbo_account}</div>
            </div>
          )}

          {config.qbo_aggregation && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">Aggregation</div>
              <Badge variant="outline" className="text-[9px]">{config.qbo_aggregation.toUpperCase()}</Badge>
            </div>
          )}

          {config.qbo_time_window && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">Time Window</div>
              <div className="flex items-center gap-1.5 text-xs text-foreground">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span>{config.qbo_time_window.label}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {config.qbo_time_window.start} → {config.qbo_time_window.end}
              </div>
            </div>
          )}
        </div>
      )}

      {config.cell_type === 'static' && (
        <div className="text-[10px] text-muted-foreground italic">
          Manually entered value — not driven by formula or external source.
        </div>
      )}
    </div>
  );
}
