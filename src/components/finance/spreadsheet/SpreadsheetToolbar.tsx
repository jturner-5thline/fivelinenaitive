import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, DollarSign, Percent, Hash,
  PaintBucket, Type, Rows3, Columns3,
  Plus, Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CellFormat } from '@/hooks/useSpreadsheetWorkbook';

interface SpreadsheetToolbarProps {
  currentFormat: CellFormat;
  onFormatChange: (format: Partial<CellFormat>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onInsertRow: () => void;
  onInsertColumn: () => void;
  onDeleteRow: () => void;
  onDeleteColumn: () => void;
}

function ToolbarButton({ 
  icon: Icon, 
  label, 
  active, 
  onClick, 
  disabled 
}: { 
  icon: React.ElementType; 
  label: string; 
  active?: boolean; 
  onClick: () => void; 
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 p-0",
            active && "bg-muted text-foreground"
          )}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SpreadsheetToolbar({
  currentFormat,
  onFormatChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onInsertRow,
  onInsertColumn,
  onDeleteRow,
  onDeleteColumn,
}: SpreadsheetToolbarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 flex-wrap">
        {/* Undo/Redo */}
        <ToolbarButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
        <ToolbarButton icon={Redo2} label="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo} />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Font size */}
        <Select
          value={String(currentFormat.fontSize || 11)}
          onValueChange={(v) => onFormatChange({ fontSize: Number(v) })}
        >
          <SelectTrigger className="h-7 w-14 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map(size => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Text formatting */}
        <ToolbarButton icon={Bold} label="Bold (Ctrl+B)" active={currentFormat.bold} onClick={() => onFormatChange({ bold: !currentFormat.bold })} />
        <ToolbarButton icon={Italic} label="Italic (Ctrl+I)" active={currentFormat.italic} onClick={() => onFormatChange({ italic: !currentFormat.italic })} />
        <ToolbarButton icon={Underline} label="Underline (Ctrl+U)" active={currentFormat.underline} onClick={() => onFormatChange({ underline: !currentFormat.underline })} />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Alignment */}
        <ToolbarButton icon={AlignLeft} label="Align Left" active={currentFormat.align === 'left'} onClick={() => onFormatChange({ align: 'left' })} />
        <ToolbarButton icon={AlignCenter} label="Align Center" active={currentFormat.align === 'center'} onClick={() => onFormatChange({ align: 'center' })} />
        <ToolbarButton icon={AlignRight} label="Align Right" active={currentFormat.align === 'right'} onClick={() => onFormatChange({ align: 'right' })} />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Number formats */}
        <ToolbarButton icon={DollarSign} label="Currency" active={currentFormat.numberFormat === '$#,##0.00'} onClick={() => onFormatChange({ numberFormat: '$#,##0.00' })} />
        <ToolbarButton icon={Percent} label="Percentage" active={currentFormat.numberFormat === '0.0%'} onClick={() => onFormatChange({ numberFormat: '0.0%' })} />
        <ToolbarButton icon={Hash} label="Number" active={currentFormat.numberFormat === '#,##0'} onClick={() => onFormatChange({ numberFormat: '#,##0' })} />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Colors */}
        <ToolbarButton icon={PaintBucket} label="Background Color" onClick={() => onFormatChange({ bgColor: '#FEF3C7' })} />
        <ToolbarButton icon={Type} label="Text Color" onClick={() => onFormatChange({ fontColor: '#DC2626' })} />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Row/Column operations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" onClick={onInsertRow}>
              <Rows3 className="h-3.5 w-3.5" />
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert Row</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" onClick={onInsertColumn}>
              <Columns3 className="h-3.5 w-3.5" />
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert Column</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" onClick={onDeleteRow}>
              <Rows3 className="h-3.5 w-3.5" />
              <Minus className="h-2.5 w-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Delete Row</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" onClick={onDeleteColumn}>
              <Columns3 className="h-3.5 w-3.5" />
              <Minus className="h-2.5 w-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Delete Column</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
