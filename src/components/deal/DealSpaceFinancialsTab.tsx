import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, Trash2, Download, Loader2, FileSpreadsheet, 
  DollarSign, Edit2, Check, Calculator, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDealSpaceFinancials, DealSpaceFinancial } from '@/hooks/useDealSpaceFinancials';
import { useExcelModelParser } from '@/hooks/useExcelModelParser';
import { FinancialModelViewer } from './financial-model/FinancialModelViewer';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface DealSpaceFinancialsTabProps {
  dealId: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);
const periodOptions = ['Q1', 'Q2', 'Q3', 'Q4', 'FY', 'H1', 'H2', 'YTD'];

const isExcelFile = (contentType: string | null, fileName: string): boolean => {
  if (contentType?.includes('spreadsheet') || contentType?.includes('excel')) return true;
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'xlsx' || ext === 'xls' || ext === 'xlsm';
};

export function DealSpaceFinancialsTab({ dealId }: DealSpaceFinancialsTabProps) {
  const { 
    financials, 
    isLoading, 
    isUploading, 
    uploadFinancial, 
    updateFinancial,
    deleteFinancial, 
    getDownloadUrl 
  } = useDealSpaceFinancials(dealId);
  
  const { parsedModel, isLoading: isParsing, parseExcelFromUrl, clearModel } = useExcelModelParser();
  
  const [isDragging, setIsDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editYear, setEditYear] = useState<string>('');
  const [editPeriod, setEditPeriod] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'model' | 'files'>('files');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-select and parse the first Excel file
  useEffect(() => {
    if (financials.length > 0 && !selectedFileId && !parsedModel) {
      const firstExcel = financials.find(f => isExcelFile(f.content_type, f.name));
      if (firstExcel) {
        handleViewFile(firstExcel);
      }
    }
  }, [financials, selectedFileId, parsedModel]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const uploaded = await uploadFinancial(files[i]);
      // Auto-open the uploaded file if it's Excel
      if (uploaded && isExcelFile(uploaded.content_type, uploaded.name)) {
        handleViewFile(uploaded);
      }
    }
  }, [uploadFinancial]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDownload = useCallback(async (financial: DealSpaceFinancial) => {
    const url = await getDownloadUrl(financial);
    if (url) {
      window.open(url, '_blank');
    }
  }, [getDownloadUrl]);

  const handleViewFile = useCallback(async (financial: DealSpaceFinancial) => {
    if (!isExcelFile(financial.content_type, financial.name)) return;
    
    const { data, error } = await supabase.storage
      .from('deal-space')
      .createSignedUrl(financial.file_path, 3600);
    
    if (error || !data) return;
    
    setSelectedFileId(financial.id);
    await parseExcelFromUrl(data.signedUrl, financial.name);
    setActiveSubTab('model');
  }, [parseExcelFromUrl]);

  const startEditing = (financial: DealSpaceFinancial) => {
    setEditingId(financial.id);
    setEditNotes(financial.notes || '');
    setEditYear(financial.fiscal_year?.toString() || '');
    setEditPeriod(financial.fiscal_period || '');
  };

  const saveEditing = async () => {
    if (!editingId) return;
    await updateFinancial(editingId, {
      notes: editNotes || undefined,
      fiscal_year: editYear ? parseInt(editYear) : undefined,
      fiscal_period: editPeriod || undefined,
    });
    setEditingId(null);
  };

  const handleCloseModel = useCallback(() => {
    clearModel();
    setSelectedFileId(null);
  }, [clearModel]);

  const excelFiles = financials.filter(f => isExcelFile(f.content_type, f.name));

  return (
    <div className="space-y-4">
      {/* Sub-tabs for Model vs Files */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'model' | 'files')}>
        <TabsList>
          <TabsTrigger value="model" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Financial Model
            {parsedModel && (
              <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Active
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="files" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Uploaded Files
            {financials.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {financials.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="model" className="mt-4">
          <FinancialModelViewer 
            dealId={dealId} 
            parsedModel={parsedModel}
            onClose={handleCloseModel}
          />
          
          {/* Quick file switcher */}
          {excelFiles.length > 1 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Switch model:</span>
              {excelFiles.map(f => (
                <Button
                  key={f.id}
                  variant={selectedFileId === f.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleViewFile(f)}
                  disabled={isParsing}
                >
                  {isParsing && selectedFileId === f.id && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  {f.name}
                </Button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-500" />
                    Financial Documents
                  </CardTitle>
                  <CardDescription>
                    Upload Excel files to view and analyze in the Financial Model tab
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden">
              {/* Upload Area */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center transition-colors mb-4",
                  isDragging ? "border-green-500 bg-green-500/5" : "border-muted-foreground/25 hover:border-green-500/50",
                  isUploading && "opacity-50 pointer-events-none"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  accept=".pdf,.xlsx,.xls,.csv,.doc,.docx"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-green-500" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop financial files here, or{' '}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-green-500 hover:underline"
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Excel files (.xlsx, .xls) will be viewable in the Financial Model tab
                    </p>
                  </div>
                )}
              </div>

              {/* Financials List */}
              <div className="flex-1 min-h-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : financials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No financial documents yet</p>
                    <p className="text-xs mt-1">Upload Excel files to analyze them</p>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="space-y-3 pr-4">
                      {financials.map((financial) => {
                        const canView = isExcelFile(financial.content_type, financial.name);
                        const isSelected = selectedFileId === financial.id;
                        
                        return (
                          <div
                            key={financial.id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg group hover:bg-muted/80 transition-colors",
                              isSelected ? "bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500/30" : "bg-muted/50"
                            )}
                          >
                            <FileSpreadsheet className={cn(
                              "h-5 w-5 mt-0.5 flex-shrink-0",
                              canView ? "text-green-500" : "text-muted-foreground"
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{financial.name}</p>
                                {canView && (
                                  <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    Excel
                                  </Badge>
                                )}
                                {isSelected && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Viewing
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatFileSize(financial.size_bytes)}</span>
                                {financial.fiscal_year && financial.fiscal_period && (
                                  <>
                                    <span>•</span>
                                    <span>{financial.fiscal_period} {financial.fiscal_year}</span>
                                  </>
                                )}
                              </div>
                              {editingId === financial.id ? (
                                <div className="mt-3 space-y-2">
                                  <div className="flex gap-2">
                                    <Select value={editYear} onValueChange={setEditYear}>
                                      <SelectTrigger className="h-8 text-xs w-24">
                                        <SelectValue placeholder="Year" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {yearOptions.map(y => (
                                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select value={editPeriod} onValueChange={setEditPeriod}>
                                      <SelectTrigger className="h-8 text-xs w-20">
                                        <SelectValue placeholder="Period" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {periodOptions.map(p => (
                                          <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="Add notes..."
                                    className="h-20 text-xs resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="default" className="h-7 text-xs" onClick={saveEditing}>
                                      <Check className="h-3 w-3 mr-1" />
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : financial.notes ? (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{financial.notes}</p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canView && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleViewFile(financial)}
                                  disabled={isParsing}
                                >
                                  {isParsing && selectedFileId === financial.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => startEditing(financial)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDownload(financial)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete financial?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete "{financial.name}".
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteFinancial(financial)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
