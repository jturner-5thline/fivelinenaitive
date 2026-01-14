import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseMasterLendersCsv, ParseResult } from '@/utils/masterLenderCsvParser';
import type { MasterLenderInsert } from '@/hooks/useMasterLenders';

interface ImportLendersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (lenders: MasterLenderInsert[]) => Promise<{ success: number; failed: number; errors: string[] }>;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

export function ImportLendersDialog({ open, onOpenChange, onImport }: ImportLendersDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const result = parseMasterLendersCsv(content);
      setParseResult(result);
      setStep('preview');
    } catch (error) {
      console.error('Error parsing CSV:', error);
      setParseResult({
        lenders: [],
        errors: ['Failed to read file. Please ensure it is a valid CSV file.'],
        skipped: 0,
      });
      setStep('preview');
    }
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.lenders.length === 0) return;

    setStep('importing');
    setProgress(0);

    // Simulate progress while importing
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 5, 90));
    }, 100);

    try {
      const result = await onImport(parseResult.lenders);
      setImportResult(result);
      setProgress(100);
    } catch (error) {
      setImportResult({
        success: 0,
        failed: parseResult.lenders.length,
        errors: [error instanceof Error ? error.message : 'Import failed'],
      });
    } finally {
      clearInterval(progressInterval);
      setStep('complete');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setParseResult(null);
    setImportResult(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Lender Database</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import lenders into your master database.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">CSV files only</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Expected columns:</p>
              <p>E-mail, Lender, Lender Type, Loan Types, Min. Rev, EBITDA Min., Min. Deal, Max Deal, Industries, Geo, Contact, Title, etc.</p>
            </div>
          </div>
        )}

        {step === 'preview' && parseResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{parseResult.lenders.length} lenders found</p>
                {parseResult.skipped > 0 && (
                  <p className="text-xs text-muted-foreground">{parseResult.skipped} rows skipped</p>
                )}
              </div>
              {parseResult.lenders.length > 0 && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
            </div>

            {parseResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Parsing Warnings</span>
                </div>
                <ScrollArea className="h-24">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {parseResult.errors.slice(0, 10).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {parseResult.errors.length > 10 && (
                      <li>...and {parseResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </ScrollArea>
              </div>
            )}

            {parseResult.lenders.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">Preview (first 5 lenders)</p>
                <ScrollArea className="h-32">
                  <ul className="text-xs space-y-1">
                    {parseResult.lenders.slice(0, 5).map((lender, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="font-medium">{lender.name}</span>
                        {lender.lender_type && (
                          <span className="text-muted-foreground">({lender.lender_type})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={parseResult.lenders.length === 0}
              >
                Import {parseResult.lenders.length} Lenders
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Importing lenders...</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              Please don't close this dialog
            </p>
          </div>
        )}

        {step === 'complete' && importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              {importResult.success > 0 ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : (
                <AlertCircle className="h-6 w-6 text-destructive" />
              )}
              <div>
                <p className="font-medium">
                  {importResult.success > 0 ? 'Import Complete' : 'Import Failed'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {importResult.success} lenders imported
                  {importResult.failed > 0 && `, ${importResult.failed} failed`}
                </p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <ScrollArea className="h-24">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {importResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
