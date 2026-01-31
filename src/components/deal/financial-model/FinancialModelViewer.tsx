import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ExcelModelSheet } from './ExcelModelSheet';
import { cn } from '@/lib/utils';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { ParsedExcelModel } from '@/hooks/useExcelModelParser';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { workbookToBlob } from '@/lib/excelUtils';

interface FinancialModelViewerProps {
  dealId: string;
  parsedModel: ParsedExcelModel | null;
  onClose?: () => void;
}

export function FinancialModelViewer({ dealId, parsedModel, onClose }: FinancialModelViewerProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  const handleExport = useCallback(async () => {
    if (!parsedModel?.rawWorkbook) return;
    
    try {
      const blob = await workbookToBlob(parsedModel.rawWorkbook);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = parsedModel.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting Excel file:', error);
    }
  }, [parsedModel]);

  if (!parsedModel) {
    return (
      <div className="flex flex-col h-[600px] border rounded-lg bg-background overflow-hidden items-center justify-center">
        <FileSpreadsheet className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">No financial model selected</p>
        <p className="text-muted-foreground/70 text-xs mt-1">
          Upload an Excel file from the "Uploaded Files" tab to view it here
        </p>
      </div>
    );
  }

  const currentSheet = parsedModel.sheets[activeSheetIndex];

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium truncate">{parsedModel.fileName}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            ({parsedModel.sheets.length} {parsedModel.sheets.length === 1 ? 'sheet' : 'sheets'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download Excel file</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {currentSheet && (
          <ExcelModelSheet sheet={currentSheet} readOnly />
        )}
      </div>

      {/* Excel-style Sheet Tabs */}
      <div className="flex items-center border-t bg-slate-100 dark:bg-slate-800 overflow-x-auto">
        {parsedModel.sheets.map((sheet, index) => (
          <button
            key={sheet.name}
            onClick={() => setActiveSheetIndex(index)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-r transition-colors whitespace-nowrap',
              activeSheetIndex === index
                ? 'bg-background text-foreground border-t-2 border-t-green-500 -mt-px'
                : 'text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {sheet.name}
          </button>
        ))}
      </div>

      {/* Status Bar */}
      {currentSheet && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
          <span>
            {currentSheet.data.length} rows × {Math.max(...currentSheet.data.map(r => r.length), 1)} columns
          </span>
          <span>Sheet: {currentSheet.name}</span>
        </div>
      )}
    </div>
  );
}
