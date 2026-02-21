import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, DollarSign, Percent, Hash,
  PaintBucket, Type, Rows3, Columns3,
  Plus, Minus, BarChart3, Grid3x3,
  ArrowDown, ArrowUp, Search, Merge, SplitSquareHorizontal,
  Lock, Palette, ShieldCheck, MessageSquare, FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CellFormat } from '@/hooks/useSpreadsheetWorkbook';
import { ColorPickerPopover } from './ColorPickerPopover';

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
  onAddChart?: () => void;
  hasRangeSelection?: boolean;
  onFindReplace?: () => void;
  onMerge?: () => void;
  onUnmerge?: () => void;
  onFreezeRows?: () => void;
  onFreezeCols?: () => void;
  frozenRows?: number;
  frozenCols?: number;
  onConditionalFormat?: () => void;
  onDataValidation?: () => void;
  onExportPdf?: () => void;
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
  onAddChart,
  hasRangeSelection,
  onFindReplace,
  onMerge,
  onUnmerge,
  onFreezeRows,
  onFreezeCols,
  frozenRows,
  frozenCols,
  onConditionalFormat,
  onDataValidation,
  onExportPdf,
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

        {/* Color pickers */}
        <ColorPickerPopover color={currentFormat.bgColor} onChange={(color) => onFormatChange({ bgColor: color || undefined })}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative">
                <PaintBucket className="h-3.5 w-3.5" />
                {currentFormat.bgColor && (
                  <div className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: currentFormat.bgColor }} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Fill Color</TooltipContent>
          </Tooltip>
        </ColorPickerPopover>

        <ColorPickerPopover color={currentFormat.fontColor} onChange={(color) => onFormatChange({ fontColor: color || undefined })}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative">
                <Type className="h-3.5 w-3.5" />
                {currentFormat.fontColor && (
                  <div className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: currentFormat.fontColor }} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Text Color</TooltipContent>
          </Tooltip>
        </ColorPickerPopover>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Borders */}
        <ToolbarButton icon={Grid3x3} label="All Borders" active={currentFormat.borderTop && currentFormat.borderBottom && currentFormat.borderLeft && currentFormat.borderRight} 
          onClick={() => {
            const allSet = currentFormat.borderTop && currentFormat.borderBottom && currentFormat.borderLeft && currentFormat.borderRight;
            onFormatChange({ borderTop: !allSet, borderBottom: !allSet, borderLeft: !allSet, borderRight: !allSet });
          }} 
        />
        <ToolbarButton icon={ArrowDown} label="Bottom Border" active={currentFormat.borderBottom} onClick={() => onFormatChange({ borderBottom: !currentFormat.borderBottom })} />
        <ToolbarButton icon={ArrowUp} label="Top Border" active={currentFormat.borderTop} onClick={() => onFormatChange({ borderTop: !currentFormat.borderTop })} />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Merge */}
        {onMerge && <ToolbarButton icon={Merge} label="Merge Cells" onClick={onMerge} disabled={!hasRangeSelection} />}
        {onUnmerge && <ToolbarButton icon={SplitSquareHorizontal} label="Unmerge Cells" onClick={onUnmerge} />}

        {/* Freeze */}
        {onFreezeRows && <ToolbarButton icon={Lock} label={frozenRows ? `Unfreeze Rows (${frozenRows})` : 'Freeze Row'} active={!!frozenRows} onClick={onFreezeRows} />}
        {onFreezeCols && <ToolbarButton icon={Lock} label={frozenCols ? `Unfreeze Cols (${frozenCols})` : 'Freeze Column'} active={!!frozenCols} onClick={onFreezeCols} />}

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Conditional formatting & validation */}
        {onConditionalFormat && <ToolbarButton icon={Palette} label="Conditional Formatting" onClick={onConditionalFormat} />}
        {onDataValidation && <ToolbarButton icon={ShieldCheck} label="Data Validation" onClick={onDataValidation} />}

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Find */}
        {onFindReplace && <ToolbarButton icon={Search} label="Find & Replace (Ctrl+F)" onClick={onFindReplace} />}

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

        {/* Chart button */}
        {onAddChart && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" onClick={onAddChart} disabled={!hasRangeSelection}>
                  <BarChart3 className="h-3.5 w-3.5" />
                  Chart
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{hasRangeSelection ? 'Create chart from selection' : 'Select a range first'}</TooltipContent>
            </Tooltip>
          </>
        )}

        {/* PDF Export */}
        {onExportPdf && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <ToolbarButton icon={FileDown} label="Export as PDF" onClick={onExportPdf} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
