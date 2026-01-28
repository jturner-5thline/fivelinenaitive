import { useState, useRef, useCallback } from 'react';
import { 
  Upload, File, Trash2, Download, Loader2, FileText, 
  Eye, Zap, ChevronRight, Table2, Presentation, X, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { useDealSpaceDocuments, DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { DealSpaceDocumentPreview } from './DealSpaceDocumentPreview';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

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
  const { documents, isLoading, isUploading, uploadDocument, deleteDocument, getDownloadUrl } = useDealSpaceDocuments(dealId);
  
  const [isDragging, setIsDragging] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DealSpaceDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<{ text: string; keyPoints: string[] } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadDocument(files[i]);
    }
  }, [uploadDocument]);

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
      window.open(url, '_blank');
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

  return (
    <>
      <Card className="flex flex-col h-[600px]">
        <CardHeader className="pb-3">
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
              {documents.length > 0 && (
                <>
                  <Badge variant="secondary" className="text-xs">
                    {documents.length} file{documents.length !== 1 ? 's' : ''}
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                  >
                    {isSummarizing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Summarize All
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
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

          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors mb-4",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
              isUploading && "opacity-50 pointer-events-none"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
              accept=".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.xlsx,.xls,.pptx"
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop files here, or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary hover:underline"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Text, Excel, PowerPoint
                </p>
              </div>
            )}
          </div>

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
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => handlePreview(doc)}
                    >
                      {getFileIcon(doc.content_type, doc.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete document?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{doc.name}" from Deal Space.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteDocument(doc)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
    </>
  );
}
