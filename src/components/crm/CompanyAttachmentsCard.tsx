import { useRef, useState } from 'react';
import { Paperclip, Upload, Download, Trash2, Loader2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCrmCompanyAttachments,
  CRM_COMPANY_ATTACHMENT_CATEGORIES,
  type CrmCompanyAttachmentCategory,
  type CrmCompanyAttachment,
} from '@/hooks/useCrmCompanyAttachments';
import { format } from 'date-fns';

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

interface Props {
  crmCompanyId: string;
}

export function CompanyAttachmentsCard({ crmCompanyId }: Props) {
  const { attachments, isLoading, uploadMany, remove } = useCrmCompanyAttachments(crmCompanyId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<CrmCompanyAttachmentCategory>('general');
  const [uploading, setUploading] = useState(false);

  const handlePick = () => fileRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await uploadMany(Array.from(files), category);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDownload = (a: CrmCompanyAttachment) => {
    if (!a.url) return;
    window.open(a.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Paperclip className="h-4 w-4" /> Attachments
            {attachments.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">{attachments.length}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Select value={category} onValueChange={(v) => setCategory(v as CrmCompanyAttachmentCategory)}>
              <SelectTrigger className="h-7 w-[120px] text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_COMPANY_ATTACHMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handlePick}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : attachments.length === 0 ? (
          <div
            className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-md py-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={handlePick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
          >
            Drop files here or click Upload
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleDownload(a)}
                    className="block text-sm text-left truncate hover:underline"
                    title={a.name}
                  >
                    {a.name}
                  </button>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      {CRM_COMPANY_ATTACHMENT_CATEGORIES.find(c => c.value === a.category)?.label || a.category}
                    </Badge>
                    <span>{formatBytes(a.size_bytes)}</span>
                    <span>·</span>
                    <span>{format(new Date(a.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => handleDownload(a)}
                  title="Download"
                  disabled={!a.url}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}