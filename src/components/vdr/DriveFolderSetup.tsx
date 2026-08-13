import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Loader2, Search, Sparkles, CheckCircle2, Link2, HardDrive } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DriveMatch } from '@/hooks/useDealDriveRoom';

interface Props {
  dealName?: string;
  companyName?: string;
  findMatches: (name: string, parentId?: string | null) => Promise<DriveMatch[]>;
  onLink: (folder: { id: string; name?: string; url?: string; autoMatched?: boolean }) => Promise<void>;
  onUseUploads?: () => void;
}

function parseFolderId(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const m1 = v.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(v)) return v;
  return null;
}

/**
 * DriveFolderSetup
 * ----------------
 * Replaces the old upload flow: pick the Drive folder that already holds this
 * deal's documents. Auto-suggests folders matching the deal / company name,
 * with a paste-a-link fallback.
 */
export function DriveFolderSetup({ dealName, companyName, findMatches, onLink, onUseUploads }: Props) {
  const [query, setQuery] = useState(dealName || companyName || '');
  const [matches, setMatches] = useState<DriveMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [autoRan, setAutoRan] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const runSearch = useCallback(async (name: string, auto = false) => {
    if (!name.trim()) return;
    setSearching(true);
    try {
      const found = await findMatches(name);
      setMatches(found);
    } finally {
      setSearching(false);
      if (auto) setAutoRan(true);
    }
  }, [findMatches]);

  // Auto-match once on mount using the deal (then company) name.
  useEffect(() => {
    const seed = dealName || companyName;
    if (!autoRan && seed) runSearch(seed, true);
  }, [autoRan, dealName, companyName, runSearch]);

  const handleLink = useCallback(async (folder: { id: string; name?: string; url?: string; autoMatched?: boolean }) => {
    setLinking(folder.id);
    try {
      await onLink(folder);
    } finally {
      setLinking(null);
    }
  }, [onLink]);

  const manualId = parseFolderId(manual);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="text-center space-y-1.5">
          <div className="mx-auto h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold">Connect this data room to Google Drive</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pick the Drive folder that already holds this deal's documents. nAItive reads it live —
            nothing gets uploaded or duplicated, and anything the team adds in Drive shows up here.
          </p>
        </div>

        {/* Auto-match / search */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Find a folder
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runSearch(query); }}
                placeholder="Deal or company name"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={() => runSearch(query)} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
            </Button>
          </div>

          {matches.length > 0 && (
            <div className="rounded-md border border-border/40 divide-y divide-border/30 overflow-hidden">
              {matches.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2.5 py-2 hover:bg-secondary/30 transition-colors">
                  <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
                  <span className="text-xs truncate flex-1">{m.name}</span>
                  {m.score >= 0.85 && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-emerald-500/30 text-emerald-400 shrink-0">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" /> best match
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    disabled={linking === m.id}
                    onClick={() => handleLink({ id: m.id, name: m.name, url: m.webViewLink, autoMatched: m.score >= 0.85 })}
                  >
                    {linking === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Use folder
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!searching && autoRan && matches.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No matching folders found in the shared drive. Paste the folder link below instead.
            </p>
          )}
        </div>

        {/* Manual link */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Or paste a folder link
          </label>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={e => setManual(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className={cn('h-8 text-xs flex-1', manual && !manualId && 'border-destructive')}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              disabled={!manualId || linking === manualId}
              onClick={() => manualId && handleLink({ id: manualId, url: manual.trim() })}
            >
              {linking === manualId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Connect
            </Button>
          </div>
          {manual && !manualId && (
            <p className="text-[11px] text-destructive">That doesn't look like a Google Drive folder link.</p>
          )}
        </div>

        {onUseUploads && (
          <div className="text-center pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={onUseUploads}>
              Use uploaded documents instead
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
