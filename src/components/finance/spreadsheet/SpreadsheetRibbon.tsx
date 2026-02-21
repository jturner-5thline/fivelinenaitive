import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, DollarSign, Percent, Hash,
  PaintBucket, Type, Rows3, Columns3,
  Plus, Minus, BarChart3, Grid3x3,
  ArrowDown, ArrowUp, Search, Merge, SplitSquareHorizontal,
  Lock, Palette, ShieldCheck, FileDown,
  SortAsc, SortDesc, Filter, WrapText, Eye, EyeOff,
  Copy, Scissors, ClipboardPaste,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CellFormat } from '@/hooks/useSpreadsheetWorkbook';
import { ColorPickerPopover } from './ColorPickerPopover';

interface SpreadsheetRibbonProps {
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
  onSort?: (direction: 'asc' | 'desc') => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onWrapText?: () => void;
  wrapText?: boolean;
}

function RibbonButton({
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
  size = 'sm',
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'lg';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "p-0 rounded-sm",
            size === 'sm' ? "h-7 w-7" : "h-10 w-10 flex-col gap-0.5",
            active && "bg-accent text-accent-foreground"
          )}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className={cn(size === 'sm' ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-0.5 px-1.5 py-0.5">
        {children}
      </div>
      <span className="text-[9px] text-muted-foreground leading-none pb-0.5">{label}</span>
    </div>
  );
}

export function SpreadsheetRibbon(props: SpreadsheetRibbonProps) {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border-b bg-muted/20">
        {/* Tab headers */}
        <div className="flex items-center border-b bg-muted/40">
          <div className="flex items-center gap-1 px-2">
            <RibbonButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={props.onUndo} disabled={!props.canUndo} />
            <RibbonButton icon={Redo2} label="Redo (Ctrl+Y)" onClick={props.onRedo} disabled={!props.canRedo} />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-7 bg-transparent rounded-none gap-0 p-0">
              {['Home', 'Insert', 'Data', 'View'].map(tab => (
                <TabsTrigger
                  key={tab}
                  value={tab.toLowerCase()}
                  className="h-7 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4 data-[state=active]:shadow-none"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Tab content */}
        <div className="flex items-end gap-0 px-1 min-h-[52px]">
          {activeTab === 'home' && (
            <>
              {/* Clipboard */}
              <RibbonGroup label="Clipboard">
                <RibbonButton icon={ClipboardPaste} label="Paste (Ctrl+V)" onClick={() => props.onPaste?.()} />
                <div className="flex flex-col gap-0.5">
                  <RibbonButton icon={Scissors} label="Cut (Ctrl+X)" onClick={() => props.onCut?.()} />
                  <RibbonButton icon={Copy} label="Copy (Ctrl+C)" onClick={() => props.onCopy?.()} />
                </div>
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              {/* Font */}
              <RibbonGroup label="Font">
                <Select
                  value={String(props.currentFormat.fontSize || 11)}
                  onValueChange={(v) => props.onFormatChange({ fontSize: Number(v) })}
                >
                  <SelectTrigger className="h-6 w-12 text-[10px] rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map(size => (
                      <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <RibbonButton icon={Bold} label="Bold (Ctrl+B)" active={props.currentFormat.bold} onClick={() => props.onFormatChange({ bold: !props.currentFormat.bold })} />
                <RibbonButton icon={Italic} label="Italic (Ctrl+I)" active={props.currentFormat.italic} onClick={() => props.onFormatChange({ italic: !props.currentFormat.italic })} />
                <RibbonButton icon={Underline} label="Underline (Ctrl+U)" active={props.currentFormat.underline} onClick={() => props.onFormatChange({ underline: !props.currentFormat.underline })} />
                <Separator orientation="vertical" className="h-5 mx-0.5" />
                <ColorPickerPopover color={props.currentFormat.bgColor} onChange={(c) => props.onFormatChange({ bgColor: c || undefined })}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-sm relative">
                    <PaintBucket className="h-3.5 w-3.5" />
                    {props.currentFormat.bgColor && <div className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: props.currentFormat.bgColor }} />}
                  </Button>
                </ColorPickerPopover>
                <ColorPickerPopover color={props.currentFormat.fontColor} onChange={(c) => props.onFormatChange({ fontColor: c || undefined })}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-sm relative">
                    <Type className="h-3.5 w-3.5" />
                    {props.currentFormat.fontColor && <div className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: props.currentFormat.fontColor }} />}
                  </Button>
                </ColorPickerPopover>
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              {/* Alignment */}
              <RibbonGroup label="Alignment">
                <RibbonButton icon={AlignLeft} label="Align Left" active={props.currentFormat.align === 'left'} onClick={() => props.onFormatChange({ align: 'left' })} />
                <RibbonButton icon={AlignCenter} label="Align Center" active={props.currentFormat.align === 'center'} onClick={() => props.onFormatChange({ align: 'center' })} />
                <RibbonButton icon={AlignRight} label="Align Right" active={props.currentFormat.align === 'right'} onClick={() => props.onFormatChange({ align: 'right' })} />
                <RibbonButton icon={WrapText} label="Wrap Text" active={props.wrapText} onClick={() => props.onWrapText?.()} />
                <RibbonButton icon={Merge} label="Merge Cells" onClick={() => props.onMerge?.()} disabled={!props.hasRangeSelection} />
                <RibbonButton icon={SplitSquareHorizontal} label="Unmerge" onClick={() => props.onUnmerge?.()} />
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              {/* Number */}
              <RibbonGroup label="Number">
                <RibbonButton icon={DollarSign} label="Currency" active={props.currentFormat.numberFormat === '$#,##0.00'} onClick={() => props.onFormatChange({ numberFormat: '$#,##0.00' })} />
                <RibbonButton icon={Percent} label="Percentage" active={props.currentFormat.numberFormat === '0.0%'} onClick={() => props.onFormatChange({ numberFormat: '0.0%' })} />
                <RibbonButton icon={Hash} label="Number" active={props.currentFormat.numberFormat === '#,##0'} onClick={() => props.onFormatChange({ numberFormat: '#,##0' })} />
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              {/* Borders */}
              <RibbonGroup label="Borders">
                <RibbonButton icon={Grid3x3} label="All Borders"
                  active={props.currentFormat.borderTop && props.currentFormat.borderBottom && props.currentFormat.borderLeft && props.currentFormat.borderRight}
                  onClick={() => {
                    const allSet = props.currentFormat.borderTop && props.currentFormat.borderBottom && props.currentFormat.borderLeft && props.currentFormat.borderRight;
                    props.onFormatChange({ borderTop: !allSet, borderBottom: !allSet, borderLeft: !allSet, borderRight: !allSet });
                  }}
                />
                <RibbonButton icon={ArrowDown} label="Bottom Border" active={props.currentFormat.borderBottom} onClick={() => props.onFormatChange({ borderBottom: !props.currentFormat.borderBottom })} />
                <RibbonButton icon={ArrowUp} label="Top Border" active={props.currentFormat.borderTop} onClick={() => props.onFormatChange({ borderTop: !props.currentFormat.borderTop })} />
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              {/* Editing */}
              <RibbonGroup label="Editing">
                <RibbonButton icon={Search} label="Find & Replace (Ctrl+F)" onClick={() => props.onFindReplace?.()} />
                <RibbonButton icon={SortAsc} label="Sort Ascending" onClick={() => props.onSort?.('asc')} />
                <RibbonButton icon={SortDesc} label="Sort Descending" onClick={() => props.onSort?.('desc')} />
              </RibbonGroup>
            </>
          )}

          {activeTab === 'insert' && (
            <>
              <RibbonGroup label="Rows & Columns">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs rounded-sm" onClick={props.onInsertRow}>
                      <Rows3 className="h-3.5 w-3.5" /><Plus className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert Row Below</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs rounded-sm" onClick={props.onInsertColumn}>
                      <Columns3 className="h-3.5 w-3.5" /><Plus className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert Column Right</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs rounded-sm" onClick={props.onDeleteRow}>
                      <Rows3 className="h-3.5 w-3.5" /><Minus className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Delete Row</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs rounded-sm" onClick={props.onDeleteColumn}>
                      <Columns3 className="h-3.5 w-3.5" /><Minus className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Delete Column</TooltipContent>
                </Tooltip>
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              <RibbonGroup label="Charts">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs rounded-sm" onClick={props.onAddChart} disabled={!props.hasRangeSelection}>
                      <BarChart3 className="h-3.5 w-3.5" /> Chart
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{props.hasRangeSelection ? 'Create chart from selection' : 'Select a range first'}</TooltipContent>
                </Tooltip>
              </RibbonGroup>
            </>
          )}

          {activeTab === 'data' && (
            <>
              <RibbonGroup label="Sort & Filter">
                <RibbonButton icon={SortAsc} label="Sort A→Z" onClick={() => props.onSort?.('asc')} />
                <RibbonButton icon={SortDesc} label="Sort Z→A" onClick={() => props.onSort?.('desc')} />
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              <RibbonGroup label="Data Tools">
                <RibbonButton icon={ShieldCheck} label="Data Validation" onClick={() => props.onDataValidation?.()} />
                <RibbonButton icon={Palette} label="Conditional Formatting" onClick={() => props.onConditionalFormat?.()} />
              </RibbonGroup>
              <Separator orientation="vertical" className="h-10 mx-0.5" />

              <RibbonGroup label="Export">
                <RibbonButton icon={FileDown} label="Export as PDF" onClick={() => props.onExportPdf?.()} />
              </RibbonGroup>
            </>
          )}

          {activeTab === 'view' && (
            <>
              <RibbonGroup label="Freeze Panes">
                <RibbonButton icon={Lock} label={props.frozenRows ? `Unfreeze Rows (${props.frozenRows})` : 'Freeze Rows'} active={!!props.frozenRows} onClick={() => props.onFreezeRows?.()} />
                <RibbonButton icon={Lock} label={props.frozenCols ? `Unfreeze Cols (${props.frozenCols})` : 'Freeze Columns'} active={!!props.frozenCols} onClick={() => props.onFreezeCols?.()} />
              </RibbonGroup>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
