import { useState, useRef, useCallback } from 'react';
import { 
  Upload, File, Trash2, Download, Loader2, FileText, 
  Eye, Zap, ChevronRight, Table2, Presentation, X, Sparkles,
  ScanSearch, AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDealSpaceDocuments, DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { useDealDocumentExtraction, DocumentExtraction } from '@/hooks/useDealDocumentExtraction';
import { DealSpaceDocumentPreview } from './DealSpaceDocumentPreview';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { downloadUrlAsFile } from '@/lib/downloadFile';

interface DealSpaceDocumentsTabProps {
  dealId: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (contentType: string | null, name: string) => {
  const lowerName = name.toLowerCase();
  if (contentType?.includes('pdf') || lowerName.endsWith('.pdf')) {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  if (contentType?.includes('word') || lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
    return <FileText className="h-5 w-5 text-blue-500" />;
  }
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return <Table2 className="h-5 w-5 text-green-500" />;
  }
  if (lowerName.endsWith('.pptx')) {
    return <Presentation className="h-5 w-5 text-orange-500" />;
  }
  if (contentType?.includes('text') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  }
  return <File className="h-5 w-5 text-muted-foreground" />;
};

export function DealSpaceDocumentsTab({ dealId }: DealSpaceDocumentsTabProps) {
  const { documents, isLoading, isUploading, uploadDocument, deleteDocument, removeFromDealSpace, deleteEntirely, getDownloadUrl } = useDealSpaceDocuments(dealId);
  const { isExtracting, extractingDocId, result: extractionResult, extractDocument, clearResult } = useDealDocumentExtraction(dealId);
  
  const [isDragging, setIsDragging] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DealSpaceDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<{ text: string; keyPoints: string[] } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [duplicateFile, setDuplicateFile] = useState<{ file: File; existingDoc: DealSpaceDocument } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showExtraction, setShowExtraction] = useState(false);

  // Single-document delete (controlled dialog so we can manage loading/state)
  const [docToDelete, setDocToDelete] = useState<DealSpaceDocument | null>(null);
  const [singleDeleteAction, setSingleDeleteAction] = useState<null | 'remove' | 'delete'>(null);

  // Bulk selection + delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteState, setBulkDeleteState] = useState<{
    isDeleting: boolean;
    completed: number;
    total: number;
  }>({ isDeleting: false, completed: 0, total: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkForDuplicate = useCallback((fileName: string): DealSpaceDocument | undefined => {
    return documents.find(doc => doc.name.toLowerCase() === fileName.toLowerCase());
  }, [documents]);

  const processFileUpload = useCallback(async (file: File, skipDuplicateCheck = false) => {
    if (!skipDuplicateCheck) {
      const existingDoc = checkForDuplicate(file.name);
      if (existingDoc) {
        setDuplicateFile({ file, existingDoc });
        return;
      }
    }
    await uploadDocument(file);
  }, [checkForDuplicate, uploadDocument]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setPendingFiles(fileArray.slice(1)); // Store remaining files
    if (fileArray.length > 0) {
      await processFileUpload(fileArray[0]);
    }
  }, [processFileUpload]);

  const handleDuplicateConfirm = useCallback(async () => {
    if (duplicateFile) {
      await uploadDocument(duplicateFile.file);
      setDuplicateFile(null);
      // Process remaining pending files
      if (pendingFiles.length > 0) {
        const [nextFile, ...remaining] = pendingFiles;
        setPendingFiles(remaining);
        await processFileUpload(nextFile);
      }
    }
  }, [duplicateFile, uploadDocument, pendingFiles, processFileUpload]);

  const handleDuplicateCancel = useCallback(async () => {
    setDuplicateFile(null);
    // Process remaining pending files
    if (pendingFiles.length > 0) {
      const [nextFile, ...remaining] = pendingFiles;
      setPendingFiles(remaining);
      await processFileUpload(nextFile);
    }
  }, [pendingFiles, processFileUpload]);

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

  const handleDownload = useCallback(async (doc: DealSpaceDocument) => {
    const url = await getDownloadUrl(doc);
    if (url) {
      await downloadUrlAsFile(url, doc.name);
    }
  }, [getDownloadUrl]);

  const handlePreview = useCallback((doc: DealSpaceDocument) => {
    setPreviewDocument(doc);
    setIsPreviewOpen(true);
  }, []);

  const handleSummarize = useCallback(async () => {
    if (documents.length === 0) return;
    
    setIsSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { dealId, action: 'summarize' },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSummary({
        text: data.summary,
        keyPoints: data.keyPoints || [],
      });
      setShowSummary(true);
      toast({ title: 'Summary generated', description: `Analyzed ${data.documentCount} document(s)` });
    } catch (err) {
      console.error('Summarization error:', err);
      toast({
        title: 'Summarization failed',
        description: err instanceof Error ? err.message : 'Could not generate summary',
        variant: 'destructive',
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [dealId, documents.length]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === documents.length) return new Set();
      return new Set(documents.map(d => d.id));
    });
  }, [documents]);

  const handleRemoveFromDealSpace = useCallback(async (currentDoc: DealSpaceDocument) => {
    setSingleDeleteAction('remove');
    try {
      const ok = await removeFromDealSpace(currentDoc);
      if (ok) {
        setSelectedIds(prev => {
          if (!prev.has(currentDoc.id)) return prev;
          const next = new Set(prev);
          next.delete(currentDoc.id);
          return next;
        });
        setDocToDelete(null);
      }
    } finally {
      setSingleDeleteAction(null);
    }
  }, [removeFromDealSpace]);

  const handleDeleteEntirely = useCallback(async (currentDoc: DealSpaceDocument) => {
    setSingleDeleteAction('delete');
    try {
      const ok = await deleteEntirely(currentDoc);
      if (ok) {
        setSelectedIds(prev => {
          if (!prev.has(currentDoc.id)) return prev;
          const next = new Set(prev);
          next.delete(currentDoc.id);
          return next;
        });
        setDocToDelete(null);
      }
    } finally {
      setSingleDeleteAction(null);
    }
  }, [deleteEntirely]);

  const handleConfirmBulkDelete = useCallback(async () => {
    const targets = documents.filter(d => selectedIds.has(d.id));
    if (targets.length === 0) return;
    setBulkDeleteState({ isDeleting: true, completed: 0, total: targets.length });
    const failed: string[] = [];
    let succeeded = 0;
    for (let i = 0; i < targets.length; i++) {
      const doc = targets[i];
      try {
        const ok = await deleteDocument(doc);
        if (ok) succeeded++; else failed.push(doc.name);
      } catch {
        failed.push(doc.name);
      }
      setBulkDeleteState(s => ({ ...s, completed: i + 1 }));
    }
    setBulkDeleteState({ isDeleting: false, completed: 0, total: 0 });
    setShowBulkDeleteDialog(false);
    setSelectedIds(new Set());
    if (failed.length === 0) {
      toast({ title: `Deleted ${succeeded} file${succeeded !== 1 ? 's' : ''}` });
    } else {
      toast({
        title: `Deleted ${succeeded} of ${targets.length} files`,
        description: `Failed: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? `, +${failed.length - 5} more` : ''}`,
        variant: 'destructive',
      });
    }
  }, [documents, selectedIds, deleteDocument]);

  const selectedCount = selectedIds.size;
  const allSelected = documents.length > 0 && selectedCount === documents.length;
  const someSelected = selectedCount > 0 && selectedCount < documents.length;

  return (
    <>
      <Card className="flex flex-col h-[600px]">
        <CardHeader
          className={cn(
            'pb-2 rounded-t-xl transition-colors',
            isDragging && 'bg-primary/5'
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents
              </CardTitle>
              <CardDescription>
                Upload transcripts, notes, and files for AI analysis
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowBulkDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected ({selectedCount})
                </Button>
              )}
              {documents.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {documents.length} file{documents.length !== 1 ? 's' : ''}
                </Badge>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
                accept=".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.xlsx,.xls,.pptx"
              />
              <Button
                variant="liquid-glass"
                size="sm"
                className="gap-2"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent
          className={cn(
            'flex-1 flex flex-col overflow-hidden relative rounded-b-xl transition-colors',
            isDragging && 'bg-primary/5 ring-2 ring-primary/40 ring-inset'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-b-xl bg-primary/10 border-2 border-dashed border-primary/50">
              <div className="flex flex-col items-center gap-2 text-primary">
                <Upload className="h-8 w-8" />
                <p className="text-sm font-medium">Drop files to upload</p>
              </div>
            </div>
          )}
          {/* Summary Section */}
          {showSummary && summary && (
            <Collapsible open={showSummary} onOpenChange={setShowSummary} className="mb-4">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <CollapsibleTrigger className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">AI Summary</span>
                  </div>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-transform",
                    showSummary && "rotate-90"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <ScrollArea className="max-h-[200px]">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{summary.text}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 text-xs"
                    onClick={() => setShowSummary(false)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Close
                  </Button>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Documents List */}
          <div className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No documents uploaded yet</p>
                <p className="text-xs mt-1">Upload files to start asking questions</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-4">
                  {documents.length > 0 && (
                    <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={() => toggleSelectAll()}
                        aria-label="Select all documents"
                      />
                      <span>{selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}</span>
                    </div>
                  )}
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => {
                        // Guard: don't open preview while a delete confirmation is pending
                        if (docToDelete || showBulkDeleteDialog) return;
                        handlePreview(doc);
                      }}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleSelect(doc.id)}
                          aria-label={`Select ${doc.name}`}
                        />
                      </div>
                      {getFileIcon(doc.content_type, doc.name)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          {doc.category && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                              title={
                                doc.source === 'vdr_internal'
                                  ? `From Data Room → Internal → ${doc.category}`
                                  : doc.source === 'data_room'
                                    ? `From Data Room → ${doc.category}`
                                    : doc.category
                              }
                            >
                              {doc.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.size_bytes)} • {format(new Date(doc.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(doc);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Extract structured data"
                          disabled={isExtracting}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const res = await extractDocument(doc.id);
                            if (res) setShowExtraction(true);
                          }}
                        >
                          {extractingDocId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ScanSearch className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDocToDelete(doc);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Document Preview Dialog */}
      <DealSpaceDocumentPreview
        document={previewDocument}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewDocument(null);
        }}
        onDownload={handleDownload}
      />

      {/* Single-document delete: two-path destructive modal */}
      <Dialog
        open={!!docToDelete}
        onOpenChange={(open) => {
          if (!open && singleDeleteAction === null) setDocToDelete(null);
        }}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose whether to remove this file only from this deal space, or
            delete it entirely from the Data Room. Removing from Deal Space
            will also stop it from feeding Ask AI for this deal.
          </p>
          {docToDelete && (
            <p className="text-xs text-muted-foreground truncate">
              File: <span className="font-medium text-foreground">{docToDelete.name}</span>
            </p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              variant="outline"
              disabled={singleDeleteAction !== null}
              onClick={(e) => {
                e.stopPropagation();
                setDocToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={singleDeleteAction !== null}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!docToDelete) return;
                void handleDeleteEntirely(docToDelete);
              }}
            >
              {singleDeleteAction === 'delete' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete entirely from Data Room'
              )}
            </Button>
            <Button
              variant="default"
              disabled={singleDeleteAction !== null}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!docToDelete) return;
                void handleRemoveFromDealSpace(docToDelete);
              }}
            >
              {singleDeleteAction === 'remove' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing…
                </>
              ) : (
                'Remove from Deal Space'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={(open) => {
          if (!open && !bulkDeleteState.isDeleting) setShowBulkDeleteDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} file{selectedCount !== 1 ? 's' : ''} from Deal Space?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDeleteState.isDeleting
                ? `Deleting ${bulkDeleteState.completed} of ${bulkDeleteState.total}…`
                : 'This action cannot be undone. Files that fail to delete will remain in the list.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteState.isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleteState.isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmBulkDelete();
              }}
            >
              {bulkDeleteState.isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting {bulkDeleteState.completed}/{bulkDeleteState.total}
                </>
              ) : (
                `Delete ${selectedCount}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate File Confirmation Dialog */}
      <AlertDialog open={!!duplicateFile} onOpenChange={(open) => !open && handleDuplicateCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate file detected</AlertDialogTitle>
            <AlertDialogDescription>
              A file named "{duplicateFile?.file.name}" already exists in the {duplicateFile?.existingDoc?.source === 'data_room' ? 'Data Room' : 'Deal Space'}. 
              Do you want to upload it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDuplicateCancel}>Skip</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateConfirm}>
              Upload Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Extraction Results Dialog */}
      <Dialog open={showExtraction && !!extractionResult} onOpenChange={(open) => { if (!open) { setShowExtraction(false); clearResult(); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch className="h-5 w-5" />
              Document Extraction Results
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            {extractionResult?.extraction && (
              <ExtractionResultsView extraction={extractionResult.extraction} />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Extraction Results Viewer ──────────────────────────────────────

function ExtractionResultsView({ extraction }: { extraction: DocumentExtraction }) {
  const meta = extraction.document_metadata;
  const company = extraction.company_profile;
  const financials = extraction.financials?.periods || [];
  const riskFlags = extraction.risk_flags || [];
  const loanAgreements = extraction.contracts?.loan_agreements || [];
  const customerAgreements = extraction.contracts?.customer_agreements || [];
  const capEntries = extraction.cap_table?.entries || [];
  const qa = extraction.qa_support;

  const fmt = (v: number | null | undefined) => v != null ? `$${v.toLocaleString()}` : '—';
  const pct = (v: number | null | undefined) => v != null ? `${v}%` : '—';

  return (
    <div className="space-y-5 pr-4 pb-4">
      {/* Document Metadata */}
      {meta && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Document Info
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {meta.document_type && <><span className="text-muted-foreground">Type</span><span className="capitalize">{meta.document_type.replace(/_/g, ' ')}</span></>}
            {meta.company_name && <><span className="text-muted-foreground">Company</span><span>{meta.company_name}</span></>}
            {meta.reporting_period && <><span className="text-muted-foreground">Period</span><span>{meta.reporting_period}</span></>}
            {meta.currency && <><span className="text-muted-foreground">Currency</span><span>{meta.currency}</span></>}
          </div>
        </section>
      )}

      {/* Company Profile */}
      {company && (company.industry || company.business_description) && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Company Profile</h3>
          <div className="text-sm space-y-1">
            {company.industry && <p><span className="text-muted-foreground">Industry:</span> {company.industry}</p>}
            {company.hq_location && <p><span className="text-muted-foreground">HQ:</span> {company.hq_location}</p>}
            {company.founded_year && <p><span className="text-muted-foreground">Founded:</span> {company.founded_year}</p>}
            {company.business_description && <p className="text-muted-foreground text-xs mt-1">{company.business_description}</p>}
          </div>
        </section>
      )}

      {/* Financial Periods */}
      {financials.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Financial Periods</h3>
          {financials.map((p, i) => (
            <div key={i} className="bg-muted/50 rounded-md p-3 mb-2">
              <p className="text-xs font-medium mb-1">{p.label || `Period ${i + 1}`}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {p.revenue != null && <><span className="text-muted-foreground">Revenue</span><span>{fmt(p.revenue)}</span></>}
                {p.arr != null && <><span className="text-muted-foreground">ARR</span><span>{fmt(p.arr)}</span></>}
                {p.mrr != null && <><span className="text-muted-foreground">MRR</span><span>{fmt(p.mrr)}</span></>}
                {p.gross_margin_percent != null && <><span className="text-muted-foreground">Gross Margin</span><span>{pct(p.gross_margin_percent)}</span></>}
                {p.ebitda != null && <><span className="text-muted-foreground">EBITDA</span><span>{fmt(p.ebitda)}</span></>}
                {p.ebitda_margin_percent != null && <><span className="text-muted-foreground">EBITDA Margin</span><span>{pct(p.ebitda_margin_percent)}</span></>}
                {p.net_income != null && <><span className="text-muted-foreground">Net Income</span><span>{fmt(p.net_income)}</span></>}
                {p.total_assets != null && <><span className="text-muted-foreground">Total Assets</span><span>{fmt(p.total_assets)}</span></>}
                {p.total_liabilities != null && <><span className="text-muted-foreground">Total Liabilities</span><span>{fmt(p.total_liabilities)}</span></>}
                {p.total_equity != null && <><span className="text-muted-foreground">Total Equity</span><span>{fmt(p.total_equity)}</span></>}
              </div>
              {p.opex && (p.opex.sales_and_marketing != null || p.opex.research_and_development != null || p.opex.general_and_administrative != null) && (
                <div className="mt-1.5 pt-1.5 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">OPEX</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {p.opex.sales_and_marketing != null && <><span className="text-muted-foreground">S&M</span><span>{fmt(p.opex.sales_and_marketing)}</span></>}
                    {p.opex.research_and_development != null && <><span className="text-muted-foreground">R&D</span><span>{fmt(p.opex.research_and_development)}</span></>}
                    {p.opex.general_and_administrative != null && <><span className="text-muted-foreground">G&A</span><span>{fmt(p.opex.general_and_administrative)}</span></>}
                    {p.opex.other_opex != null && <><span className="text-muted-foreground">Other</span><span>{fmt(p.opex.other_opex)}</span></>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Loan Agreements */}
      {loanAgreements.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Loan Agreements</h3>
          {loanAgreements.map((la, i) => (
            <div key={i} className="bg-muted/50 rounded-md p-3 mb-2 text-xs space-y-0.5">
              {la.lender_name && <p><span className="text-muted-foreground">Lender:</span> {la.lender_name}</p>}
              {la.facility_type && <p><span className="text-muted-foreground">Facility:</span> {la.facility_type}</p>}
              {la.commitment_amount != null && <p><span className="text-muted-foreground">Amount:</span> {fmt(la.commitment_amount)}</p>}
              {la.interest_rate && <p><span className="text-muted-foreground">Rate:</span> {la.interest_rate}</p>}
              {la.maturity_date && <p><span className="text-muted-foreground">Maturity:</span> {la.maturity_date}</p>}
              {la.financial_covenants && <p><span className="text-muted-foreground">Covenants:</span> {la.financial_covenants}</p>}
              {la.security_or_collateral && <p><span className="text-muted-foreground">Collateral:</span> {la.security_or_collateral}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Customer Agreements */}
      {customerAgreements.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Customer Agreements</h3>
          {customerAgreements.map((ca, i) => (
            <div key={i} className="bg-muted/50 rounded-md p-3 mb-2 text-xs space-y-0.5">
              {ca.customer_name && <p><span className="text-muted-foreground">Customer:</span> {ca.customer_name}</p>}
              {ca.contract_value != null && <p><span className="text-muted-foreground">Value:</span> {fmt(ca.contract_value)}</p>}
              {ca.contract_term && <p><span className="text-muted-foreground">Term:</span> {ca.contract_term}</p>}
              {ca.renewal_terms && <p><span className="text-muted-foreground">Renewal:</span> {ca.renewal_terms}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Cap Table */}
      {capEntries.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Cap Table</h3>
          <div className="bg-muted/50 rounded-md p-3 text-xs space-y-1">
            {capEntries.map((e, i) => (
              <div key={i} className="flex justify-between">
                <span>{e.holder_name} {e.class_or_series ? `(${e.class_or_series})` : ''}</span>
                <span className="text-muted-foreground">{e.ownership_percent != null ? `${e.ownership_percent}%` : '—'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Risk Flags */}
      {riskFlags.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Risk Flags ({riskFlags.length})
          </h3>
          <div className="space-y-2">
            {riskFlags.map((rf, i) => (
              <div key={i} className={cn(
                "rounded-md p-3 text-xs border-l-2",
                rf.severity === 'high' ? 'border-l-destructive bg-destructive/5' :
                rf.severity === 'medium' ? 'border-l-orange-500 bg-orange-500/5' :
                'border-l-muted-foreground bg-muted/50'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={rf.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0">
                    {rf.severity}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rf.category}</Badge>
                </div>
                <p>{rf.description}</p>
                {rf.source_reference?.text_snippet && (
                  <p className="text-muted-foreground mt-1 italic">
                    "{rf.source_reference.text_snippet}"{rf.source_reference.page ? ` — p.${rf.source_reference.page}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* QA Summary */}
      {qa?.key_points_summary && (
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Info className="h-4 w-4" /> Key Points
          </h3>
          <p className="text-xs text-muted-foreground">{qa.key_points_summary}</p>
        </section>
      )}

      {/* Processing Notes */}
      {(extraction.meta?.processing_notes || extraction.meta?.uncertainty_notes) && (
        <section className="border-t border-border pt-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-1">Processing Notes</h3>
          {extraction.meta.processing_notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{extraction.meta.processing_notes}</p>}
          {extraction.meta.uncertainty_notes && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
              <span className="font-medium">Uncertainties:</span> {extraction.meta.uncertainty_notes}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
