import { useMemo, useRef, useState } from 'react';
import { Upload, Download, Trash2, Loader2, FileText, Filter, Replace, Eye, Paperclip } from 'lucide-react';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCrmCompanyAttachments,
  CRM_COMPANY_ATTACHMENT_CATEGORIES,
  type CrmCompanyAttachmentCategory,
  type CrmCompanyAttachment,
} from '@/hooks/useCrmCompanyAttachments';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type AttachmentStatus = 'received' | 'pending' | 'approved' | 'missing';

const STATUS_META: Record<AttachmentStatus, { label: string; className: string }> = {
  received:  { label: 'Received', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  pending:   { label: 'Pending',  className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  approved:  { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  missing:   { label: 'Missing',  className: 'bg-red-500/10 text-red-600 border-red-500/20' },
};

function deriveStatus(a: CrmCompanyAttachment): AttachmentStatus {
  // No DB column yet — surface a sensible default; real workflow status to come.
  return 'received';
}

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
  const replaceRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<CrmCompanyAttachmentCategory>('general');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [replaceTarget, setReplaceTarget] = useState<CrmCompanyAttachment | null>(null);

  const enriched = useMemo(
    () => attachments.map(a => ({ ...a, status: deriveStatus(a) })),
    [attachments],
  );

  const filtered = useMemo(() => enriched.filter(a =>
    (filterCategory === 'all' || a.category === filterCategory) &&
    (filterStatus === 'all' || a.status === filterStatus),
  ), [enriched, filterCategory, filterStatus]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try { await uploadMany(Array.from(files), uploadCategory); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleReplace = async (files: FileList | null) => {
    if (!files || !files.length || !replaceTarget) return;
    setUploading(true);
    try {
      await uploadMany([files[0]], replaceTarget.category);
      await remove(replaceTarget);
    } finally {
      setUploading(false);
      setReplaceTarget(null);
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  const preview = (a: CrmCompanyAttachment) => {
    if (a.url) window.open(a.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card id="attachments" className="border-border/70 scroll-mt-24">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Attachments</CardTitle>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {attachments.length} total
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All categories</SelectItem>
                {CRM_COMPANY_ATTACHMENT_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                {(Object.keys(STATUS_META) as AttachmentStatus[]).map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="h-5 w-px bg-border mx-1" />
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
              Upload Attachment
            </Button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            <input ref={replaceRef} type="file" className="hidden" onChange={e => handleReplace(e.target.files)} />
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          'p-0 transition-colors',
          dragOver && 'bg-primary/5',
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : attachments.length === 0 ? (
          <div
            className="m-4 border border-dashed rounded-md py-12 text-center cursor-pointer hover:bg-muted/30"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No attachments yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag &amp; drop files here, or click to upload contracts, NDAs, financials and more
              {companyName ? ` for ${companyName}` : ''}.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            No attachments match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-[11px] uppercase tracking-wide">File</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Category</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Related</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Uploaded by</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Date</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide w-[1%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(a => {
                  const status = STATUS_META[a.status];
                  return (
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
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {companyName || 'Company'}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {format(new Date(a.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={cn('text-[10px] font-normal', status.className)}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 text-xs">Actions</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => preview(a)} disabled={!a.url}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => preview(a)} disabled={!a.url}>
                              <Download className="h-3.5 w-3.5 mr-2" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setReplaceTarget(a); replaceRef.current?.click(); }}>
                              <Replace className="h-3.5 w-3.5 mr-2" /> Replace
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => remove(a)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function useCompanyAttachmentSummary(crmCompanyId: string) {
  const { attachments } = useCrmCompanyAttachments(crmCompanyId);
  const total = attachments.length;
  const latest = attachments[0];
  return { total, latest, attachments };
}