import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FolderOpen, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File, folderPath: string) => Promise<void>;
  defaultFolderPath?: string;
}

function extNameFromMime(name: string, mime: string): string {
  if (!mime.startsWith('application/vnd.google-apps.')) return name;
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': '.docx',
    'application/vnd.google-apps.spreadsheet': '.xlsx',
    'application/vnd.google-apps.presentation': '.pptx',
    'application/vnd.google-apps.drawing': '.pdf',
  };
  const ext = map[mime];
  if (!ext) return name;
  return name.endsWith(ext) ? name : `${name}${ext}`;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function LinkDriveFolderDialog({ open, onOpenChange, onImport, defaultFolderPath = '/' }: Props) {
  const [url, setUrl] = useState('');
  const [listing, setListing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setUrl(''); setFiles([]); setSelected(new Set());
  };

  const handleList = async () => {
    if (!url.trim()) return;
    setListing(true);
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'list', folder: url.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list: DriveFile[] = (data?.files ?? []).filter(
        (f: DriveFile) => f.mimeType !== 'application/vnd.google-apps.folder',
      );
      setFiles(list);
      setSelected(new Set(list.map(f => f.id)));
      if (list.length === 0) toast.info('No files found in that Drive folder');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to list Drive folder');
    } finally {
      setListing(false);
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    let ok = 0; let fail = 0;
    for (const f of files) {
      if (!selected.has(f.id)) continue;
      try {
        const { data, error } = await supabase.functions.invoke('drive-folder-import', {
          body: { action: 'download', fileId: f.id, mimeType: f.mimeType },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const blob = base64ToBlob(data.base64, data.mimeType);
        const finalName = extNameFromMime(f.name, f.mimeType);
        const file = new File([blob], finalName, { type: data.mimeType });
        await onImport(file, defaultFolderPath);
        ok++;
      } catch (err) {
        console.error(`Failed to import ${f.name}`, err);
        fail++;
      }
    }
    setImporting(false);
    if (ok) toast.success(`Imported ${ok} file${ok === 1 ? '' : 's'} from Drive`);
    if (fail) toast.error(`${fail} file${fail === 1 ? '' : 's'} failed to import`);
    if (ok && !fail) {
      reset();
      onOpenChange(false);
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Link Google Drive Folder
          </DialogTitle>
          <DialogDescription className="text-xs">
            Paste a Drive folder URL. Files will be imported into the Internal column.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="https://drive.google.com/drive/folders/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={listing || importing}
          />
          <Button onClick={handleList} disabled={!url.trim() || listing || importing}>
            {listing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'List files'}
          </Button>
        </div>

        {files.length > 0 && (
          <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
            {files.map(f => (
              <label key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={selected.has(f.id)}
                  onCheckedChange={() => toggle(f.id)}
                  disabled={importing}
                />
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {f.mimeType.replace('application/vnd.google-apps.', 'gdoc:')}
                </span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={selected.size === 0 || importing}
          >
            {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Import {selected.size > 0 ? `${selected.size} ` : ''}to Internal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}