import { useRef, useState } from 'react';
import { Upload, Download, Trash2, Loader2, FileText, Eye, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCrmCompanyAttachments,
  CRM_COMPANY_ATTACHMENT_CATEGORIES,
  type CrmCompanyAttachmentCategory,
  type CrmCompanyAttachment,
} from '@/hooks/useCrmCompanyAttachments';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function formatBytes(n: number) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

interface Props {
  crmCompanyId: string;
  companyName?: string;
}

export function CompanyAttachmentsTable({ crmCompanyId, companyName }: Props) {
  const { attachments, isLoading, uploadMany, remove } = useCrmCompanyAttachments(crmCompanyId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<CrmCompanyAttachmentCategory>('general');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmCompanyAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try { await uploadMany(Array.from(files), uploadCategory); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = (a: CrmCompanyAttachment) => {
    if (a.url) window.open(a.url, '_blank', 'noopener,noreferrer');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <Card id="attachments" className="border-border/70 scroll-mt-24">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Attachments</CardTitle>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={uploadCategory} onValueChange={v => setUploadCategory(v as CrmCompanyAttachmentCategory)}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_COMPANY_ATTACHMENT_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Upload
            </Button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          'p-4 transition-colors',
          dragOver && 'bg-primary/5',
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : attachments.length === 0 ? (
          <div
            className="border border-dashed rounded-md py-10 text-center cursor-pointer hover:bg-muted/30"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No attachments yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag &amp; drop files here, or click to upload{companyName ? ` for ${companyName}` : ''}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-[11px] uppercase tracking-wide">File</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Category</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Date</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide w-[1%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.map(a => (
                  <TableRow key={a.id} className="hover:bg-muted/20">
                    <TableCell className="py-2">
                      <button
                        type="button"
                        onClick={() => preview(a)}
                        className="flex items-center gap-2 text-left min-w-0 group"
                        title={a.name}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate group-hover:underline max-w-[280px]">{a.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(a.size_bytes)}</span>
                      </button>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {CRM_COMPANY_ATTACHMENT_CATEGORIES.find(c => c.value === a.category)?.label || a.category}
                      </Badge>
                      {a.source === 'funding_source' && (
                        <Badge variant="secondary" className="ml-1 text-[10px] font-normal">
                          Funding source
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {format(new Date(a.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="py-2 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => preview(a)} disabled={!a.url} title="Preview">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => preview(a)} disabled={!a.url} title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(a)}
                        title="Delete attachment"
                        aria-label="Delete attachment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium">{deleteTarget?.name}</span> from this company. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function useCompanyAttachmentSummary(crmCompanyId: string) {
  const { attachments } = useCrmCompanyAttachments(crmCompanyId);
  const total = attachments.length;
  const latest = attachments[0];
  return { total, latest, attachments };
}