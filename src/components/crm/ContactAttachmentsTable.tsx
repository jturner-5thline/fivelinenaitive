import { useRef, useState } from 'react';
import { Upload, Download, Trash2, Loader2, FileText, Eye, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCrmContactAttachments,
  CRM_CONTACT_ATTACHMENT_CATEGORIES,
  type CrmContactAttachmentCategory,
  type CrmContactAttachment,
} from '@/hooks/useCrmContactAttachments';
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
  contactId: string;
  contactName?: string;
}

export function ContactAttachmentsTable({ contactId, contactName }: Props) {
  const { attachments, isLoading, uploadMany, remove } = useCrmContactAttachments(contactId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<CrmContactAttachmentCategory>('general');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmContactAttachment | null>(null);
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

  const preview = (a: CrmContactAttachment) => {
    if (a.url) window.open(a.url, '_blank', 'noopener,noreferrer');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await remove(deleteTarget); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          <span>{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={uploadCategory} onValueChange={v => setUploadCategory(v as CrmContactAttachmentCategory)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CRM_CONTACT_ATTACHMENT_CATEGORIES.map(c => (
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

      <div
        className={cn('rounded-md transition-colors', dragOver && 'bg-primary/5')}
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
              Drag &amp; drop files here, or click to upload{contactName ? ` for ${contactName}` : ''}.
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
                        <span className="text-sm truncate group-hover:underline max-w-[240px]">{a.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(a.size_bytes)}</span>
                      </button>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {CRM_CONTACT_ATTACHMENT_CATEGORIES.find(c => c.value === a.category)?.label || a.category}
                      </Badge>
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
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium">{deleteTarget?.name}</span> from this contact. This cannot be undone.
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
    </div>
  );
}