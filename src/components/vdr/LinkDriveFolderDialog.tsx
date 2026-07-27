import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FolderOpen, FileText, Folder, ChevronRight, Search, Home, ArrowLeft, Link2, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';
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

const IMPORT_PROGRESS_STORAGE_KEY = 'vdr:drive-import:last';
interface PersistedImport {
  items: ImportItem[];
  finishedAt: number | null;
  startedAt: number;
}
function loadPersistedImport(): PersistedImport | null {
  try {
    const raw = localStorage.getItem(IMPORT_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedImport;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch { return null; }
}
function savePersistedImport(p: PersistedImport | null) {
  try {
    if (!p) localStorage.removeItem(IMPORT_PROGRESS_STORAGE_KEY);
    else localStorage.setItem(IMPORT_PROGRESS_STORAGE_KEY, JSON.stringify(p));
  } catch { /* ignore quota */ }
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
  /** Prefill the browse search box (e.g. deal name) and auto-run once on open. */
  defaultSearchQuery?: string;
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

function formatSize(bytes?: string | number): string {
  if (bytes === undefined || bytes === null || bytes === '') return '—';
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatModified(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return 'just now';
  if (diffMs < 60 * 60 * 1000) return `${Math.round(diffMs / (60 * 1000))}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / (60 * 60 * 1000))}h ago`;
  if (diffMs < 7 * day) return `${Math.round(diffMs / day)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function friendlyType(mime: string): string {
  if (mime === FOLDER_MIME) return 'Folder';
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.drawing': 'Google Drawing',
    'application/vnd.google-apps.form': 'Google Form',
    'application/pdf': 'PDF',
    'text/plain': 'Text',
    'text/csv': 'CSV',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/gif': 'GIF',
    'application/zip': 'ZIP',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.ms-excel': 'Excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  };
  return map[mime] ?? mime.split('/').pop() ?? 'File';
}

/** Normalize a folder name for fuzzy matching: lowercase, strip punctuation, collapse whitespace. */
function normalizeFolderName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\-–—/\\|.]+/g, ' ')
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pick the best internal-folder match for a Drive folder name.
 * Priority: exact normalized equality > one contains the other (min length ≥ 3). Returns null when no match. */
function autoMatchTarget(driveFolderName: string, internalFolders: string[]): string | null {
  const q = normalizeFolderName(driveFolderName);
  if (!q) return null;
  const normalized = internalFolders.map(name => ({ name, norm: normalizeFolderName(name) }));
  const exact = normalized.find(f => f.norm === q);
  if (exact) return exact.name;
  const contains = normalized
    .filter(f => f.norm.length >= 3 && (f.norm.includes(q) || q.includes(f.norm)))
    .sort((a, b) => Math.abs(a.norm.length - q.length) - Math.abs(b.norm.length - q.length));
  return contains[0]?.name ?? null;
}

export function LinkDriveFolderDialog({ open, onOpenChange, onImport, defaultFolderPath = '/', internalFolders = [], defaultSearchQuery = '' }: Props) {
  const [mode, setMode] = useState<'browse' | 'url'>('browse');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }]);
  const [search, setSearch] = useState(defaultSearchQuery);
  const [didAutoSearch, setDidAutoSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<ImportItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [lastFinishedAt, setLastFinishedAt] = useState<number | null>(null);

  // Restore any prior import progress from localStorage when dialog opens.
  useEffect(() => {
    if (!open) return;
    const persisted = loadPersistedImport();
    if (persisted && persisted.items.length > 0) {
      // Any items still marked in-flight from a previous session are stale — mark failed.
      const items = persisted.items.map(it =>
        it.status === 'importing' || it.status === 'queued'
          ? { ...it, status: 'failed' as ImportStatus, error: it.error ?? 'Interrupted before completion' }
          : it,
      );
      setProgress(items);
      setShowResults(true);
      setLastFinishedAt(persisted.finishedAt);
    }
  }, [open]);

  const reset = () => {
    setUrl(''); setFiles([]); setSelected(new Set()); setSearch('');
    setCrumbs([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }]); setMode('browse');
    setProgress([]); setShowResults(false); setUrlError(null); setPreviewingId(null);
    setLastFinishedAt(null);
    setDidAutoSearch(false);
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
      if (defaultSearchQuery && !didAutoSearch) {
        setDidAutoSearch(true);
        setSearch(defaultSearchQuery);
        // Fire a search scoped to the shared drive root using the deal name.
        (async () => {
          setSearching(true); setSelected(new Set());
          try {
            const { data, error } = await supabase.functions.invoke('drive-folder-import', {
              body: { action: 'search', query: defaultSearchQuery, folderId: ROOT_FOLDER_ID },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            setFiles(data?.files ?? []);
            setCrumbs([
              { id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME },
              { id: '__search', name: `Search: ${defaultSearchQuery}` },
            ]);
          } catch (err) {
            console.error(err);
            // Fall back to root browse if search fails.
            browse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME, true);
          } finally {
            setSearching(false);
          }
        })();
      } else {
        browse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME, true);
      }
    }
  }, [open, mode, browse, files.length, crumbs.length, defaultSearchQuery, didAutoSearch]);

  // Reset the one-shot auto-search flag whenever the dialog closes.
  useEffect(() => {
    if (!open) setDidAutoSearch(false);
  }, [open]);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) { browse(ROOT_FOLDER_ID, ROOT_FOLDER_NAME, true); return; }
    setSearching(true); setSelected(new Set());
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
    setLoading(true); setSelected(new Set());
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

  const handleImport = async (overrideFiles?: DriveFile[]) => {
    const importFiles = overrideFiles ?? files.filter(f => selected.has(f.id));
    if (importFiles.length === 0) return;
    setImporting(true);
    setShowResults(true);
    setLastFinishedAt(null);
    const startedAt = Date.now();
    let ok = 0; let fail = 0;

    // Build the current Drive browse path (e.g. "Deals/Acme") from crumbs so
    // individually selected files preserve their location inside Internal.
    // Skip the synthetic root and any search/url pseudo-crumbs.
    const browsePath = crumbs
      .slice(1)
      .filter(c => c.id !== '__search' && c.id !== '__url')
      .map(c => c.name)
      .join('/');
    const baseForTopFiles = browsePath ? `/${browsePath}` : '/';

    // Upload one Drive file. `targetPath` is the absolute Internal path (leading slash,
    // no trailing slash except root). Root is "/".
    const uploadOne = async (df: DriveFile, targetPath: string) => {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'download', fileId: df.id, mimeType: df.mimeType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const blob = base64ToBlob(data.base64, data.mimeType);
      const finalName = extNameFromMime(df.name, df.mimeType);
      const file = new File([blob], finalName, { type: data.mimeType });
      const clean = (targetPath || '/').replace(/\/+$/g, '') || '/';
      await onImport(file, clean.startsWith('/') ? clean : `/${clean}`);
    };

    const updateItem = (key: string, patch: Partial<ImportItem>) => {
      setProgress(prev => {
        const next = prev.map(it => it.key === key ? { ...it, ...patch } : it);
        savePersistedImport({ items: next, startedAt, finishedAt: null });
        return next;
      });
    };
    const addItems = (items: ImportItem[]) => {
      setProgress(prev => {
        const next = [...prev, ...items];
        savePersistedImport({ items: next, startedAt, finishedAt: null });
        return next;
      });
    };

    // Recursively collect every file inside a Drive folder, preserving the relative
    // subfolder path so Internal upload mirrors the Drive structure.
    const collectFiles = async (
      folderId: string,
      relPath = '',
    ): Promise<{ file: DriveFile; relPath: string }[]> => {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'browse', folderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const children: DriveFile[] = data?.files ?? [];
      const out: { file: DriveFile; relPath: string }[] = [];
      for (const c of children) {
        if (c.mimeType === FOLDER_MIME) {
          const nested = await collectFiles(c.id, relPath ? `${relPath}/${c.name}` : c.name);
          out.push(...nested);
        } else {
          out.push({ file: c, relPath });
        }
      }
      return out;
    };

    // Seed queue with top-level selected items (folders shown as placeholders until expanded).
    // Folders upload their whole tree; files upload to Internal root.
    const seed: ImportItem[] = importFiles.map(f => ({
        key: `top:${f.id}`,
        name: f.mimeType === FOLDER_MIME ? `${f.name} (folder)` : f.name,
        target: f.mimeType === FOLDER_MIME
          ? (browsePath ? `/${browsePath}/${f.name}` : `/${f.name}`)
          : baseForTopFiles,
        status: 'queued' as ImportStatus,
      }));
    setProgress(seed);
    savePersistedImport({ items: seed, startedAt, finishedAt: null });

    for (const f of importFiles) {
      if (f.mimeType === FOLDER_MIME) {
        // Preserve the Drive folder name (and subfolder structure) inside Internal,
        // rooted at the current browse path so nested folders keep their parents.
        const rootTarget = browsePath ? `/${browsePath}/${f.name}` : `/${f.name}`;
        updateItem(`top:${f.id}`, { status: 'importing' });
        try {
          const children = await collectFiles(f.id, '');
          if (children.length === 0) {
            updateItem(`top:${f.id}`, { status: 'failed', error: 'Folder is empty' });
            fail++;
          } else {
            // Replace folder placeholder with its child items.
            const childItems: ImportItem[] = children.map((c, i) => ({
              key: `${f.id}:${c.file.id}:${i}`,
              name: c.relPath ? `${f.name}/${c.relPath}/${c.file.name}` : `${f.name}/${c.file.name}`,
              target: c.relPath ? `${rootTarget}/${c.relPath}` : rootTarget,
              status: 'queued' as ImportStatus,
            }));
            setProgress(prev => {
              const next = prev.flatMap(it => it.key === `top:${f.id}` ? childItems : [it]);
              savePersistedImport({ items: next, startedAt, finishedAt: null });
              return next;
            });
            for (let i = 0; i < children.length; i++) {
              const child = children[i];
              const item = childItems[i];
              const key = item.key;
              updateItem(key, { status: 'importing' });
              try {
                await uploadOne(child.file, item.target);
                updateItem(key, { status: 'completed' });
                ok++;
              } catch (err) {
                console.error(`Failed to import ${child.file.name}`, err);
                updateItem(key, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' });
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
          // Individually selected files land in the current browse path so
          // their folder context in Drive is preserved.
          await uploadOne(f, baseForTopFiles);
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
    const finishedAt = Date.now();
    setLastFinishedAt(finishedAt);
    setProgress(prev => {
      savePersistedImport({ items: prev, startedAt, finishedAt });
      return prev;
    });
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

  // Download a Drive file and open it in a new tab for preview.
  const handlePreview = async (f: DriveFile) => {
    if (f.mimeType === FOLDER_MIME) return;
    setPreviewingId(f.id);
    try {
      const { data, error } = await supabase.functions.invoke('drive-folder-import', {
        body: { action: 'download', fileId: f.id, mimeType: f.mimeType },
      });
      const serverMessage = (data && (data.message || (typeof data.error === 'string' ? data.error : null))) as string | null;
      if (error) throw new Error(serverMessage || error.message || 'Preview failed');
      if (data?.error) throw new Error(serverMessage || 'Preview failed');
      const blob = base64ToBlob(data.base64, data.mimeType);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        toast.info('Preview blocked by pop-up blocker — downloading instead');
        const a = document.createElement('a');
        a.href = url; a.download = extNameFromMime(f.name, f.mimeType);
        document.body.appendChild(a); a.click(); a.remove();
      }
      // Revoke after a delay so the new tab has time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preview failed';
      console.error(err);
      toast.error(msg);
    } finally {
      setPreviewingId(null);
    }
  };

  // Selection summary (top-level; folders count as 1 item, not expanded).
  const selectedFiles = files.filter(f => selected.has(f.id));
  const selectedFileRows = selectedFiles.filter(f => f.mimeType !== FOLDER_MIME);
  const selectedFolderRows = selectedFiles.filter(f => f.mimeType === FOLDER_MIME);
  const selectedTotalBytes = selectedFileRows.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Google Drive
          </DialogTitle>
          <DialogDescription className="text-xs">
            Browse the shared 5th Line Drive. Check a folder to upload it (and its full contents) into Internal — the folder's own name is preserved. Files upload to Internal root.
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
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                placeholder="https://drive.google.com/drive/folders/…"
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (urlError) setUrlError(null); }}
                disabled={loading || importing}
                aria-invalid={!!urlError}
                className={urlError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              <Button onClick={handleListFromUrl} disabled={!url.trim() || loading || importing}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'List files'}
              </Button>
            </div>
            {urlError && (
              <p className="text-xs text-destructive" role="alert">{urlError}</p>
            )}
          </div>
        )}

        {/* File list */}
        {showResults ? (
          <ImportProgressPanel
            items={progress}
            importing={importing}
            finishedAt={lastFinishedAt}
            onClear={() => {
              savePersistedImport(null);
              setProgress([]);
              setShowResults(false);
              setLastFinishedAt(null);
            }}
          />
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
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          disabled={loading || importing}
                          title="Open folder"
                        >
                          <Folder className="h-3.5 w-3.5 text-primary" />
                          <span className="truncate hover:underline">{f.name}</span>
                        </button>
                        <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0">
                          Folder · {formatModified(f.modifiedTime)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] shrink-0"
                          disabled={importing}
                          title={`Upload "${f.name}" and all of its contents into Internal`}
                          onClick={() => handleImport([f])}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          Upload Folder
                        </Button>
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                        </label>
                        <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0 w-24 truncate text-right" title={f.mimeType}>
                          {friendlyType(f.mimeType)}
                        </span>
                        <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0 w-20 text-right" title={f.modifiedTime}>
                          {formatModified(f.modifiedTime)}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right tabular-nums">
                          {formatSize(f.size)}
                        </span>
                        <Button
                          size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"
                          onClick={() => handlePreview(f)}
                          disabled={importing || previewingId === f.id}
                          title="Preview / download"
                          aria-label={`Preview ${f.name}`}
                        >
                          {previewingId === f.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
        )}

        {/* Selection summary — shown when the user has checked any items pre-import */}
        {!showResults && selectedFiles.length > 0 && (
          <div className="text-xs text-muted-foreground border rounded-md px-3 py-2 flex items-center gap-3 flex-wrap">
            <span className="font-medium text-foreground">{selectedFiles.length} selected</span>
            <span>
              {selectedFileRows.length} file{selectedFileRows.length === 1 ? '' : 's'}
              {selectedFolderRows.length > 0 && ` · ${selectedFolderRows.length} folder${selectedFolderRows.length === 1 ? '' : 's'} (contents expanded on import)`}
            </span>
            {selectedFileRows.length > 0 && (
              <span>· ~{formatSize(selectedTotalBytes)}</span>
            )}
            <span className="ml-auto">Folders keep their name in Internal · files → Internal root</span>
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
              <Button onClick={() => handleImport()} disabled={selected.size === 0 || importing}>
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

function ImportProgressPanel({ items, importing, finishedAt, onClear }: { items: ImportItem[]; importing: boolean; finishedAt?: number | null; onClear?: () => void }) {
  const total = items.length;
  const completed = items.filter(i => i.status === 'completed').length;
  const failed = items.filter(i => i.status === 'failed').length;
  const inflight = items.filter(i => i.status === 'importing').length;
  const queued = items.filter(i => i.status === 'queued').length;
  const pct = total === 0 ? 0 : Math.round(((completed + failed) / total) * 100);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'importing' | 'queued'>('all');
  const visible = filter === 'all' ? items : items.filter(i => i.status === filter);

  const copyErrors = () => {
    const lines = items
      .filter(i => i.status === 'failed')
      .map(i => `${i.name}\t${i.error ?? 'Upload failed'}`);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success(`Copied ${lines.length} error${lines.length === 1 ? '' : 's'} to clipboard`);
  };

  const Tab = ({ id, label, count, tone }: { id: typeof filter; label: string; count: number; tone?: string }) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border transition-colors ${
        filter === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted'
      } ${tone ?? ''}`}
    >
      {label} <span className="ml-1 opacity-80">{count}</span>
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {importing
            ? 'Importing…'
            : finishedAt
              ? `Last import · ${new Date(finishedAt).toLocaleString()}`
              : 'Import complete'}
        </span>
        <span className="text-muted-foreground">
          {completed}/{total} completed
          {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
          {inflight > 0 && <span> · {inflight} in progress</span>}
          {queued > 0 && <span> · {queued} queued</span>}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <Tab id="all" label="All" count={total} />
          <Tab id="completed" label="Succeeded" count={completed} />
          <Tab id="failed" label="Failed" count={failed} />
          <Tab id="importing" label="In progress" count={inflight} />
          <Tab id="queued" label="Queued" count={queued} />
        </div>
        {failed > 0 && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={copyErrors}>
            Copy errors
          </Button>
        )}
        {!importing && onClear && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onClear}>
            Clear history
          </Button>
        )}
      </div>
      <div className="min-h-[240px] max-h-[380px] overflow-y-auto border rounded-md divide-y">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Preparing import…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            No files in this view.
          </div>
        ) : visible.map(item => (
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