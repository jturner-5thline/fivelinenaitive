import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload, FileSpreadsheet, CheckCircle2, ArrowRight, Sparkles, AlertCircle,
  ChevronRight, X, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

type WizardStep = 'upload' | 'detect' | 'map' | 'confirm';

interface DetectedColumn {
  sourceCol: string;
  suggestedMapping: string;
  confidence: number;
  sampleValues: string[];
}

const P_AND_L_CATEGORIES = [
  'Revenue', 'Cost of Revenue', 'Gross Profit', 'Sales & Marketing',
  'R&D', 'G&A', 'Operating Expenses', 'EBITDA', 'Net Income',
  'Depreciation', 'Interest', 'Tax', 'Other Income', 'Skip'
];

const MOCK_DETECTED: DetectedColumn[] = [
  { sourceCol: 'Total Sales', suggestedMapping: 'Revenue', confidence: 0.96, sampleValues: ['$420K', '$385K', '$410K'] },
  { sourceCol: 'COGS', suggestedMapping: 'Cost of Revenue', confidence: 0.98, sampleValues: ['-$168K', '-$154K', '-$164K'] },
  { sourceCol: 'Marketing Spend', suggestedMapping: 'Sales & Marketing', confidence: 0.92, sampleValues: ['-$63K', '-$58K', '-$65K'] },
  { sourceCol: 'Engineering', suggestedMapping: 'R&D', confidence: 0.89, sampleValues: ['-$105K', '-$98K', '-$102K'] },
  { sourceCol: 'Office & Admin', suggestedMapping: 'G&A', confidence: 0.87, sampleValues: ['-$42K', '-$40K', '-$41K'] },
  { sourceCol: 'Depreciation', suggestedMapping: 'Depreciation', confidence: 0.99, sampleValues: ['-$12K', '-$12K', '-$12K'] },
];

interface SmartUploadWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SmartUploadWizard({ open, onOpenChange }: SmartUploadWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [fileName, setFileName] = useState('');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [detecting, setDetecting] = useState(false);

  const handleFileSelect = useCallback(() => {
    setFileName('Q1_2026_Financials.xlsx');
    setDetecting(true);
    setTimeout(() => {
      setDetecting(false);
      const initial: Record<string, string> = {};
      MOCK_DETECTED.forEach(d => { initial[d.sourceCol] = d.suggestedMapping; });
      setMappings(initial);
      setStep('map');
    }, 1500);
  }, []);

  const handleMappingChange = useCallback((sourceCol: string, target: string) => {
    setMappings(prev => ({ ...prev, [sourceCol]: target }));
  }, []);

  const acceptedCount = Object.values(mappings).filter(v => v !== 'Skip').length;
  const totalCount = MOCK_DETECTED.length;
  const avgConfidence = MOCK_DETECTED.reduce((s, d) => s + d.confidence, 0) / totalCount;

  const handleConfirm = useCallback(() => {
    setStep('confirm');
    setTimeout(() => {
      onOpenChange(false);
      setStep('upload');
      setFileName('');
    }, 2000);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Smart Upload Wizard
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload an Excel or CSV file and we'll auto-detect P&L structure and map columns.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
          {(['upload', 'detect', 'map', 'confirm'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium",
                step === s ? "bg-primary text-primary-foreground" :
                ['upload', 'detect', 'map', 'confirm'].indexOf(step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {['upload', 'detect', 'map', 'confirm'].indexOf(step) > i ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn(step === s && "text-foreground font-medium")}>
                {s === 'upload' ? 'Upload' : s === 'detect' ? 'Detect' : s === 'map' ? 'Map' : 'Import'}
              </span>
              {i < 3 && <ChevronRight className="h-3 w-3" />}
            </div>
          ))}
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={handleFileSelect}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drop your file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv — max 20MB</p>
          </div>
        )}

        {/* Step: Detecting */}
        {step === 'upload' && detecting && (
          <Card className="mt-4">
            <CardContent className="p-4 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Analyzing {fileName}...</p>
              <p className="text-xs text-muted-foreground">Detecting P&L structure and column types</p>
              <Progress value={65} className="mt-3 h-1.5" />
            </CardContent>
          </Card>
        )}

        {/* Step: Mapping */}
        {step === 'map' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{fileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{acceptedCount}/{totalCount} mapped</Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {(avgConfidence * 100).toFixed(0)}% avg confidence
                </Badge>
              </div>
            </div>

            <ScrollArea className="h-[340px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Source Column</TableHead>
                    <TableHead className="text-[10px] w-8 text-center"><ArrowRight className="h-3 w-3 mx-auto" /></TableHead>
                    <TableHead className="text-[10px]">P&L Category</TableHead>
                    <TableHead className="text-[10px] text-right">Confidence</TableHead>
                    <TableHead className="text-[10px]">Sample</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_DETECTED.map((col) => (
                    <TableRow key={col.sourceCol}>
                      <TableCell className="text-xs font-medium">{col.sourceCol}</TableCell>
                      <TableCell className="text-center"><ArrowRight className="h-3 w-3 mx-auto text-muted-foreground" /></TableCell>
                      <TableCell>
                        <Select value={mappings[col.sourceCol]} onValueChange={(v) => handleMappingChange(col.sourceCol, v)}>
                          <SelectTrigger className="h-7 text-[11px] w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {P_AND_L_CATEGORIES.map(cat => (
                              <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "text-xs font-mono",
                          col.confidence >= 0.95 ? 'text-emerald-600' :
                          col.confidence >= 0.9 ? 'text-amber-600' : 'text-orange-600'
                        )}>
                          {(col.confidence * 100).toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground font-mono">
                        {col.sampleValues.slice(0, 2).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
            <p className="text-sm font-medium">Import Complete!</p>
            <p className="text-xs text-muted-foreground mt-1">{acceptedCount} columns mapped to your P&L model</p>
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setStep('upload'); setFileName(''); }}>
                Back
              </Button>
              <Button size="sm" onClick={handleConfirm} className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Import {acceptedCount} Columns
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
