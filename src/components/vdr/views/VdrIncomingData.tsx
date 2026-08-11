import { useState, useCallback, useRef } from 'react';
import { useVdrDocuments } from '@/hooks/useVdrDocuments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Mail, Upload, Eye, Download, Trash2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { VdrDocument } from '@/components/vdr/types';
import { format } from 'date-fns';
import { downloadUrlAsFile } from '@/lib/downloadFile';

interface VdrIncomingDataProps {
  dealId: string;
  vdrDocs: ReturnType<typeof useVdrDocuments>;
  onPreview: (doc: VdrDocument) => void;
}

const DOC_TYPES = ['Call Transcript', 'Meeting Notes', 'Email Thread', 'Other'] as const;

export function VdrIncomingData({ dealId, vdrDocs, onPreview }: VdrIncomingDataProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter to only incoming-source documents
  const incomingDocs = vdrDocs.documents.filter(d => d.source === 'incoming' && !d.is_folder);

  const handleUpload = useCallback(async (files: File[]) => {
    for (const file of files) {
      await vdrDocs.uploadFile(file, '/incoming/', 'incoming');
    }
  }, [vdrDocs]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  }, [handleUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleUpload]);

  const handleDownload = useCallback(async (doc: VdrDocument) => {
    if (!doc.file_path) return;
    const url = await vdrDocs.getDownloadUrl(doc.file_path);
    if (url) await downloadUrlAsFile(url, doc.filename);
  }, [vdrDocs]);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Email Integration Placeholder */}
      <div className="px-6 pt-6 pb-4">
        <h2 className="text-sm font-semibold mb-3">Email Integration</h2>
        <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
          <Mail className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-foreground/80 mb-1">Connect your email to automatically sync deal-related communications.</p>
          <p className="text-xs text-muted-foreground mb-4">Incoming emails will be parsed and categorized automatically.</p>
          <Button size="sm" variant="outline" onClick={() => toast.info('Email integration coming in Phase 2')}>
            Configure Email Sync
          </Button>
        </div>
      </div>

      {/* Additional Documents */}
      <div className="px-6 pb-6 flex-1">
        <h2 className="text-sm font-semibold mb-1">Additional Documents</h2>
        <p className="text-xs text-muted-foreground mb-3">Upload call transcripts, meeting notes, or any supplementary documents</p>

        {/* Upload Zone */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors mb-4',
            isDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:border-primary/40'
          )}
        >
          <Upload className="h-5 w-5 mx-auto mb-2" />
          <p className="text-xs">Drop files here or click to upload</p>
        </div>

        {/* Documents Table */}
        {incomingDocs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5 w-36">Type</th>
                <th className="px-3 py-2.5 w-28">Upload Date</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {incomingDocs.map(doc => (
                <tr key={doc.id} className="border-b border-border/30 hover:bg-secondary/20">
                  <td className="px-3 py-2.5">
                    <button className="text-sm font-medium hover:text-primary transition-colors text-left truncate max-w-[300px]" onClick={() => onPreview(doc)}>
                      {doc.filename}
                    </button>
                    <span className="text-[10px] text-muted-foreground ml-2">{doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Select defaultValue="Other" onValueChange={() => {}}>
                      <SelectTrigger className="h-7 text-xs w-32 bg-secondary/30 border-border/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(doc.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-3 py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem onClick={() => onPreview(doc)}><Eye className="h-3 w-3 mr-2" /> Preview</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(doc)}><Download className="h-3 w-3 mr-2" /> Download</DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive">
                              <Trash2 className="h-3 w-3 mr-2" /> Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Document</AlertDialogTitle>
                              <AlertDialogDescription>Delete "{doc.filename}"?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => vdrDocs.deleteDocument(doc)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {incomingDocs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No additional documents uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
