import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Download, FileText, Table2, BarChart3, Presentation } from 'lucide-react';
import { toast } from 'sonner';

interface ExportPreset {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  format: string;
}

const PRESETS: ExportPreset[] = [
  { id: 'monthly-pnl', label: 'Monthly P&L', description: 'Income statement with variances', icon: <Table2 className="h-4 w-4" />, format: 'PDF' },
  { id: 'board-deck', label: 'Board Deck', description: 'Executive summary + KPIs', icon: <Presentation className="h-4 w-4" />, format: 'PPTX' },
  { id: 'full-financials', label: 'Full Financials', description: 'P&L, BS, Cash Flow bundle', icon: <FileText className="h-4 w-4" />, format: 'PDF' },
  { id: 'kpi-snapshot', label: 'KPI Snapshot', description: 'All KPI cards as summary', icon: <BarChart3 className="h-4 w-4" />, format: 'PNG' },
];

export function ExportPresetsButton() {
  const handleExport = (preset: ExportPreset) => {
    toast.success(`Exporting "${preset.label}" as ${preset.format}...`, {
      description: 'Your download will start shortly.',
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="p-2 border-b">
          <p className="text-xs font-medium">Quick Export</p>
        </div>
        {PRESETS.map(preset => (
          <div
            key={preset.id}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer border-b last:border-0"
            onClick={() => handleExport(preset)}
          >
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
              {preset.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">{preset.label}</p>
              <p className="text-[10px] text-muted-foreground">{preset.description}</p>
            </div>
            <span className="text-[9px] text-muted-foreground font-mono">{preset.format}</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
