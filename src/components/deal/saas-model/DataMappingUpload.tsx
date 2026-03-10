import { useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, RefreshCw } from 'lucide-react';
import type { AnalyzedFile } from './dataMappingUtils';
import { KEYWORD_ALIASES } from './dataMappingUtils';
import { parseExcelFromFile } from '@/lib/excelUtils';
import { IS_FIELDS, BS_FIELDS, type FileAnalysisResult } from './types';

interface Props {
  onFilesAnalyzed: (files: AnalyzedFile[]) => void;
}

export function DataMappingUpload({ onFilesAnalyzed }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const analyzeFile = useCallback(async (file: File): Promise<AnalyzedFile> => {
    try {
      const result = await parseExcelFromFile(file);
      const matchedFields: string[] = [];
      let isMatches = 0, bsMatches = 0;

      result.sheets.forEach(sheet => {
        sheet.data.forEach(row => {
          const label = String(row[0] || '').toLowerCase().trim();
          if (!label) return;
          for (const [keyword, field] of Object.entries(KEYWORD_ALIASES)) {
            if (label.includes(keyword) && !matchedFields.includes(field)) {
              matchedFields.push(field);
              if ((IS_FIELDS as readonly string[]).includes(field)) isMatches++;
              else bsMatches++;
            }
          }
        });
      });

      const totalMatches = matchedFields.length;
      let status: FileAnalysisResult['status'] = 'unrecognized';
      if (totalMatches >= 8) status = 'mappable';
      else if (totalMatches >= 2) status = 'partial';

      let type: FileAnalysisResult['type'] = 'Unknown';
      if (isMatches > 0 && bsMatches > 0) type = 'IS + BS';
      else if (isMatches > 0) type = 'Income Statement';
      else if (bsMatches > 0) type = 'Balance Sheet';

      return { file, sheets: result.sheets, analysis: { status, type, totalMatches, isMatches, bsMatches, matchedFields } };
    } catch {
      return { file, sheets: [], analysis: { status: 'error', type: 'Unknown', totalMatches: 0, isMatches: 0, bsMatches: 0, matchedFields: [] } };
    }
  }, []);

  const handleFilesSelected = useCallback(async (files: FileList) => {
    setIsProcessing(true);
    const results: AnalyzedFile[] = [];
    for (const file of Array.from(files)) {
      results.push(await analyzeFile(file));
    }
    results.sort((a, b) => b.analysis.totalMatches - a.analysis.totalMatches);
    onFilesAnalyzed(results);
    setIsProcessing(false);
  }, [analyzeFile, onFilesAnalyzed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  return (
    <>
      <Card className="border-border/30 border-dashed group/dropzone hover:border-primary/40 transition-colors">
        <CardContent className="p-16 flex flex-col items-center justify-center text-center"
          onDragOver={e => { e.preventDefault(); e.currentTarget.closest('.group\\/dropzone')?.classList.add('border-primary/60'); }}
          onDragLeave={e => { e.currentTarget.closest('.group\\/dropzone')?.classList.remove('border-primary/60'); }}
          onDrop={e => { e.currentTarget.closest('.group\\/dropzone')?.classList.remove('border-primary/60'); handleDrop(e); }}>
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Analyzing files...</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4 bg-primary/10">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-sm font-semibold mb-1">Upload Financial Statements</h3>
              <p className="text-xs text-muted-foreground mb-1">Drag & drop Excel files or click to browse</p>
              <p className="text-[10px] text-muted-foreground/60 mb-4">Supports .xlsx, .xls, .csv — Multiple files welcome</p>
              <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Browse Files
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" multiple
                onChange={e => e.target.files && handleFilesSelected(e.target.files)} />
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { title: 'Bulk Upload', desc: 'Upload multiple files at once for batch analysis' },
          { title: 'Auto-Detect Headers', desc: 'Column headers are detected automatically from your data' },
          { title: 'Smart Mapping', desc: '200+ keyword aliases + AI suggestions for instant mapping' },
        ].map(f => (
          <Card key={f.title} className="border-border/20">
            <CardContent className="p-4">
              <h4 className="text-xs font-semibold mb-1">{f.title}</h4>
              <p className="text-[10px] text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

// Need useState import
import { useState } from 'react';
