import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FolderOpen, FileText, Folder, ChevronRight, Search, Home, ArrowLeft, Link2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
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

type ImportStatus = 'queued' | 'importing' | 'completed' | 'failed';
interface ImportItem {
  key: string;
  name: string;
  target: string;
  status: ImportStatus;
  error?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_ID = '1J1U31M05ZmQe6ekNpQWQ-DL9g7BdGEv2';
const ROOT_FOLDER_NAME = '5th Line Shared Drive';

const DRIVE_FOLDER_URL_RE = /^https?:\/\/(?:drive|docs)\.google\.com\/.*(?:\/folders\/[a-zA-Z0-9_-]{10,}|[?&]id=[a-zA-Z0-9_-]{10,})/i;
const RAW_ID_RE = /^[a-zA-Z0-9_-]{20,}$/;

function validateFolderInput(raw: string): { ok: true } | { ok: false; message: string } {
  const v = raw.trim();
  if (!v) return { ok: false, message: 'Paste a Google Drive folder link to continue.' };
  if (RAW_ID_RE.test(v)) return { ok: true };
  let parsed: URL;
  try { parsed = new URL(v); } catch { return { ok: false, message: 'That isn\'t a valid URL. Paste a link like https://drive.google.com/drive/folders/…' }; }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'drive.google.com' && host !== 'docs.google.com') {
    return { ok: false, message: 'Only Google Drive links are supported (drive.google.com).' };
  }
  if (/\/file\/d\//i.test(parsed.pathname)) {
    return { ok: false, message: 'That link points to a file, not a folder. Open the folder in Drive and copy its URL.' };
  }
  if (!DRIVE_FOLDER_URL_RE.test(v)) {
    return { ok: false, message: 'Couldn\'t find a folder ID in that URL. It should look like https://drive.google.com/drive/folders/…' };
  }
  return { ok: true };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File, folderPath: string) => Promise<void>;
  defaultFolderPath?: string;
  /** Ordered list of Internal folder names available as mapping targets. */
  internalFolders?: string[];
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

export function LinkDriveFolderDialog({ open, onOpenChange, onImport, defaultFolderPath = '/', internalFolders = [] }: Props) {
  const [mode, setMode] = useState<'browse' | 'url'>('browse');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  // Per-row mapping: driveId -> internal folder name (target).
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // Default target used when a row has no explicit mapping.
  const [defaultTarget, setDefaultTarget] = useState<string>(() => {
    const cleaned = (defaultFolderPath || '/').replace(/^\/+|\/+$/g, '');
    return cleaned || (internalFolders[0] ?? '');
  });
  const [progress, setProgress] = useState<ImportItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!defaultTarget && internalFolders.length) setDefaultTarget(internalFolders[0]);
  }, [internalFolders, defaultTarget]);

  const reset = () => {
    setUrl(''); setFiles([]); setSelected(new Set()); setSearch(''); setMapping({});
    setCrumbs([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }]); setMode('browse');
    setProgress([]); setShowResults(false); setUrlError(null);
  };

  const browse = useCallback(async (folderId: string, name?: string, replace?: boolean) => {
    setLoading(true); setSelected(new Set()); setSearch(''); setMapping({});
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'browse', folderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFiles(data?.files ?? []);
      if (replace) {
        setCrumbs([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }]);
      } else if (folderId === ROOT_FOLDER_ID) {
        setCrumbs([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }]);
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
      browse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME, true);
    }
  }, [open, mode, browse, files.length, crumbs.length]);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) { browse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME, true); return; }
    setSearching(true); setSelected(new Set()); setMapping({});
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'search', query: q, folderId: ROOT_FOLDER_ID },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFiles(data?.files ?? []);
      setCrumbs([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }, { id: '__search', name: `Search: ${q}` }]);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleListFromUrl = async () => {
    const check = validateFolderInput(url);
    if (check.ok === false) { setUrlError(check.message); return; }
    setUrlError(null);
    setLoading(true); setSelected(new Set()); setMapping({});
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'list', folder: url.trim() },
      });
      // Prefer the server's human-readable `message` over the raw error code.
      const serverMessage = (data && (data.message || (typeof data.error === 'string' ? data.error : null))) as string | null;
      if (error) throw new Error(serverMessage || error.message || 'Failed to list folder');
      if (data?.error) throw new Error(serverMessage || 'Failed to list folder');
      const list: DriveFile[] = data?.files ?? [];
      setFiles(list);
      setSelected(new Set(list.filter(f => f.mimeType !== FOLDER_MIME).map(f => f.id)));
      setCrumbs([{ id: 'root', name: 'My Drive' }, { id: '__url', name: data?.folder?.name ?? 'Linked folder' }]);
      if (list.length === 0) toast.info('No files in that folder');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to list folder';
      console.error(err);
      setUrlError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setShowResults(true);
    let ok = 0; let fail = 0;

    const uploadOne = async (df: DriveFile, targetName: string) => {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'download', fileId: df.id, mimeType: df.mimeType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const blob = base64ToBlob(data.base64, data.mimeType);
      const finalName = extNameFromMime(df.name, df.mimeType);
      const file = new File([blob], finalName, { type: data.mimeType });
      const clean = (targetName || '').replace(/^\/+|\/+$/g, '');
      await onImport(file, clean ? `/${clean}` : '/');
    };

    const updateItem = (key: string, patch: Partial<ImportItem>) => {
      setProgress(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it));
    };
    const addItems = (items: ImportItem[]) => {
      setProgress(prev => [...prev, ...items]);
    };

    // Recursively collect every file inside a Drive folder.
    const collectFiles = async (folderId: string): Promise<DriveFile[]> => {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'browse', folderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const children: DriveFile[] = data?.files ?? [];
      const out: DriveFile[] = [];
      for (const c of children) {
        if (c.mimeType === FOLDER_MIME) {
          const nested = await collectFiles(c.id);
          out.push(...nested);
        } else {
          out.push(c);
        }
      }
      return out;
    };

    // Seed queue with top-level selected items (folders shown as placeholders until expanded).
    const seed: ImportItem[] = files
      .filter(f => selected.has(f.id))
      .map(f => ({
        key: `top:${f.id}`,
        name: f.mimeType === FOLDER_MIME ? `${f.name} (folder)` : f.name,
        target: defaultTarget,
        status: 'queued' as ImportStatus,
      }));
    setProgress(seed);

    for (const f of files) {
      if (!selected.has(f.id)) continue;
      const target = defaultTarget;
      if (!target) {
        updateItem(`top:${f.id}`, { status: 'failed', error: 'No target folder' });
        fail++; continue;
      }

      if (f.mimeType === FOLDER_MIME) {
        updateItem(`top:${f.id}`, { status: 'importing' });
        try {
          const children = await collectFiles(f.id);
          if (children.length === 0) {
            updateItem(`top:${f.id}`, { status: 'failed', error: 'Folder is empty' });
            fail++;
          } else {
            // Replace folder placeholder with its child items.
            const childItems: ImportItem[] = children.map((c, i) => ({
              key: `${f.id}:${c.id}:${i}`,
              name: `${f.name}/${c.name}`,
              target,
              status: 'queued' as ImportStatus,
            }));
            setProgress(prev => prev.flatMap(it => it.key === `top:${f.id}` ? childItems : [it]));
            for (const child of children) {
              const key = childItems.find(ci => ci.name === `${f.name}/${child.name}`)?.key;
              if (key) updateItem(key, { status: 'importing' });
              try {
                await uploadOne(child, target);
                if (key) updateItem(key, { status: 'completed' });
                ok++;
              } catch (err) {
                console.error(`Failed to import ${child.name}`, err);
                if (key) updateItem(key, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' });
                fail++;
              }
            }
          }
        } catch (err) {
          console.error(`Failed to list folder ${f.name}`, err);
          updateItem(`top:${f.id}`, { status: 'failed', error: err instanceof Error ? err.message : 'Failed to list folder' });
          fail++;
        }
      } else {
        updateItem(`top:${f.id}`, { status: 'importing' });
        try {
          await uploadOne(f, target);
          updateItem(`top:${f.id}`, { status: 'completed' });
          ok++;
        } catch (err) {
          console.error(`Failed to import ${f.name}`, err);
          updateItem(`top:${f.id}`, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' });
          fail++;
        }
      }
    }
    setImporting(false);
    if (ok) toast.success(`Imported ${ok} file${ok === 1 ? '' : 's'} from Drive`);
    if (fail) toast.error(`${fail} file${fail === 1 ? '' : 's'} failed to import`);
    // Keep dialog open so user can review per-file results; they close manually.
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectableIds = files.map(f => f.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Google Drive
          </DialogTitle>
          <DialogDescription className="text-xs">
            Browse the shared 5th Line Drive. Check any folder (uploads all contents, recursively) or file, then import into the Default target.
          </DialogDescription>
        </DialogHeader>

        {/* Default mapping target — applied to any selected row without its own mapping */}
        {internalFolders.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">Default target:</span>
            <Select value={defaultTarget} onValueChange={setDefaultTarget} disabled={importing}>
              <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue placeholder="Choose folder…" /></SelectTrigger>
              <SelectContent>
                {internalFolders.map(name => (
                  <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
                onClick={() => browse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME, true)}
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
        {showResults ? (
          <ImportProgressPanel items={progress} importing={importing} />
        ) : (
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
              {selectableIds.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-muted/30 sticky top-0">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={importing} />
                  <span>Select all ({selectableIds.length})</span>
                </div>
              )}
              {files.map(f => {
                const isFolder = f.mimeType === FOLDER_MIME;
                const isChecked = selected.has(f.id);
                return (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggle(f.id)}
                      disabled={importing}
                    />
                    {isFolder ? (
                      <>
                        <button
                          onClick={() => browse(f.id, f.name)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:underline"
                          disabled={loading || importing}
                          title="Open folder"
                        >
                          <Folder className="h-3.5 w-3.5 text-primary" />
                          <span className="flex-1 truncate">{f.name}</span>
                        </button>
                        {isChecked && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                            Folder · all contents
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="flex-1 truncate">{f.name}</span>
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
        )}

        <DialogFooter>
          {showResults && !importing ? (
            <>
              <Button variant="ghost" onClick={() => { setShowResults(false); setProgress([]); }}>Back to browse</Button>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
              <Button onClick={handleImport} disabled={selected.size === 0 || importing}>
                {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Import {selected.size > 0 ? `${selected.size} ` : ''}to Internal
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportProgressPanel({ items, importing }: { items: ImportItem[]; importing: boolean }) {
  const total = items.length;
  const completed = items.filter(i => i.status === 'completed').length;
  const failed = items.filter(i => i.status === 'failed').length;
  const inflight = items.filter(i => i.status === 'importing').length;
  const queued = items.filter(i => i.status === 'queued').length;
  const pct = total === 0 ? 0 : Math.round(((completed + failed) / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {importing ? 'Importing…' : 'Import complete'}
        </span>
        <span className="text-muted-foreground">
          {completed}/{total} completed
          {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
          {inflight > 0 && <span> · {inflight} in progress</span>}
          {queued > 0 && <span> · {queued} queued</span>}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="min-h-[240px] max-h-[380px] overflow-y-auto border rounded-md divide-y">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Preparing import…
          </div>
        ) : items.map(item => (
          <div key={item.key} className="flex items-center gap-2 px-3 py-2 text-sm">
            {item.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            {item.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            {item.status === 'importing' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
            {item.status === 'queued' && <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="truncate">{item.name}</div>
              {item.error && <div className="text-[10px] text-destructive truncate">{item.error}</div>}
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
              {item.status === 'completed' ? `→ ${item.target}` : item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}