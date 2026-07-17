import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FolderOpen, FileText, Folder, ChevronRight, Search, Home, ArrowLeft, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
}

interface Crumb { id: string; name: string; }

const FOLDER_MIME = 'application/vnd.google-apps.folder';

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
  const [mode, setMode] = useState<'browse' | 'url'>('browse');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: 'root', name: 'My Drive' }]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const reset = () => {
    setUrl(''); setFiles([]); setSelected(new Set()); setSearch('');
    setCrumbs([{ id: 'root', name: 'My Drive' }]); setMode('browse');
  };

  const browse = useCallback(async (folderId: string, name?: string, replace?: boolean) => {
    setLoading(true); setSelected(new Set()); setSearch('');
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'browse', folderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFiles(data?.files ?? []);
      if (replace) {
        setCrumbs([{ id: 'root', name: 'My Drive' }]);
      } else if (folderId === 'root') {
        setCrumbs([{ id: 'root', name: 'My Drive' }]);
      } else {
        // if navigating forward, append; if crumb click, we set crumbs there directly
        setCrumbs(prev => {
          const existing = prev.findIndex(c => c.id === folderId);
          if (existing >= 0) return prev.slice(0, existing + 1);
          return [...prev, { id: folderId, name: name ?? data?.folder?.name ?? 'Folder' }];
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to browse Drive');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && mode === 'browse' && files.length === 0 && crumbs.length === 1) {
      browse('root', 'My Drive', true);
    }
  }, [open, mode, browse, files.length, crumbs.length]);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) { browse('root', 'My Drive', true); return; }
    setSearching(true); setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'search', query: q },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFiles(data?.files ?? []);
      setCrumbs([{ id: 'root', name: 'My Drive' }, { id: '__search', name: `Search: ${q}` }]);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleListFromUrl = async () => {
    if (!url.trim()) return;
    setLoading(true); setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'list', folder: url.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list: DriveFile[] = data?.files ?? [];
      setFiles(list);
      setSelected(new Set(list.filter(f => f.mimeType !== FOLDER_MIME).map(f => f.id)));
      setCrumbs([{ id: 'root', name: 'My Drive' }, { id: '__url', name: 'Linked folder' }]);
      if (list.length === 0) toast.info('No files in that folder');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to list folder');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    let ok = 0; let fail = 0;
    for (const f of files) {
      if (!selected.has(f.id) || f.mimeType === FOLDER_MIME) continue;
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

  const selectableFileIds = files.filter(f => f.mimeType !== FOLDER_MIME).map(f => f.id);
  const allSelected = selectableFileIds.length > 0 && selectableFileIds.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableFileIds));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Google Drive
          </DialogTitle>
          <DialogDescription className="text-xs">
            Browse or search the shared 5th Line Drive, then import selected files into Internal.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 border-b pb-2">
          <Button
            size="sm" variant={mode === 'browse' ? 'secondary' : 'ghost'}
            onClick={() => { setMode('browse'); reset(); setMode('browse'); }}
            disabled={loading || importing || searching}
            className="h-7 gap-1"
          >
            <FolderOpen className="h-3.5 w-3.5" /> Browse
          </Button>
          <Button
            size="sm" variant={mode === 'url' ? 'secondary' : 'ghost'}
            onClick={() => { setMode('url'); setFiles([]); setSelected(new Set()); setCrumbs([{ id: 'root', name: 'My Drive' }]); }}
            disabled={loading || importing || searching}
            className="h-7 gap-1"
          >
            <Link2 className="h-3.5 w-3.5" /> Paste URL
          </Button>
        </div>

        {mode === 'browse' && (
          <>
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7 h-8"
                  placeholder="Search Drive by filename…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  disabled={loading || importing || searching}
                />
              </div>
              <Button size="sm" onClick={handleSearch} disabled={loading || importing || searching} className="h-8">
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
              </Button>
              <Button
                size="sm" variant="outline" className="h-8 gap-1"
                onClick={() => browse('root', 'My Drive', true)}
                disabled={loading || importing || searching}
                title="Home"
              >
                <Home className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
              {crumbs.map((c, i) => (
                <span key={c.id + i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <button
                    className={`hover:underline ${i === crumbs.length - 1 ? 'text-foreground font-medium' : ''}`}
                    onClick={() => {
                      if (c.id === '__search' || c.id === '__url') return;
                      if (i === crumbs.length - 1) return;
                      setCrumbs(crumbs.slice(0, i + 1));
                      browse(c.id, c.name);
                    }}
                    disabled={loading || importing || c.id === '__search' || c.id === '__url'}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
              {crumbs.length > 1 && crumbs[crumbs.length - 1].id !== '__url' && crumbs[crumbs.length - 1].id !== '__search' && (
                <Button
                  size="sm" variant="ghost" className="h-6 ml-auto gap-1 text-xs"
                  onClick={() => {
                    const parent = crumbs[crumbs.length - 2];
                    setCrumbs(crumbs.slice(0, -1));
                    browse(parent.id, parent.name);
                  }}
                  disabled={loading || importing}
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </Button>
              )}
            </div>
          </>
        )}

        {mode === 'url' && (
          <div className="flex gap-2">
            <Input
              placeholder="https://drive.google.com/drive/folders/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading || importing}
            />
            <Button onClick={handleListFromUrl} disabled={!url.trim() || loading || importing}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'List files'}
            </Button>
          </div>
        )}

        {/* File list */}
        <div className="min-h-[240px] max-h-[380px] overflow-y-auto border rounded-md divide-y">
          {loading || searching ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              {mode === 'url' ? 'Paste a Drive folder URL to list files.' : 'Empty folder.'}
            </div>
          ) : (
            <>
              {selectableFileIds.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-muted/30 sticky top-0">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={importing} />
                  <span>Select all files ({selectableFileIds.length})</span>
                </div>
              )}
              {files.map(f => {
                const isFolder = f.mimeType === FOLDER_MIME;
                return (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                    {isFolder ? (
                      <span className="w-4" />
                    ) : (
                      <Checkbox
                        checked={selected.has(f.id)}
                        onCheckedChange={() => toggle(f.id)}
                        disabled={importing}
                      />
                    )}
                    {isFolder ? (
                      <button
                        onClick={() => browse(f.id, f.name)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:underline"
                        disabled={loading || importing}
                      >
                        <Folder className="h-3.5 w-3.5 text-primary" />
                        <span className="flex-1 truncate">{f.name}</span>
                      </button>
                    ) : (
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {f.mimeType.startsWith('application/vnd.google-apps.')
                            ? f.mimeType.replace('application/vnd.google-apps.', 'gdoc:')
                            : (f.mimeType.split('/')[1] ?? f.mimeType)}
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={selected.size === 0 || importing}>
            {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Import {selected.size > 0 ? `${selected.size} ` : ''}to Internal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}