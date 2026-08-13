import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DriveNode {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  /** Path relative to the linked root folder, e.g. "Financials/2025". */
  path: string;
  parentPath: string;
  isFolder: boolean;
}

export interface DriveFolderLink {
  id: string;
  deal_id: string;
  folder_id: string;
  folder_name: string | null;
  folder_url: string | null;
  auto_matched: boolean;
}

export interface DriveMatch {
  id: string;
  name: string;
  webViewLink?: string;
  score: number;
}

/** Shared Drive root that auto-match searches under. */
export const DRIVE_AUTOMATCH_ROOT_ID = '1J1U31M05ZmQe6ekNpQWQ-DL9g7BdGEv2';

async function callDrive<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('drive-folder-import', { body });
  if (error) {
    let details = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx?.text) details = await ctx.text();
    } catch { /* keep original */ }
    throw new Error(details);
  }
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return data as T;
}

/**
 * Live Google Drive folder acting as the backend for a deal's data room.
 *
 * Nothing is copied into nAItive storage — the tree is read straight from
 * Drive on every load, so whatever the team puts in the folder is what the
 * data room shows.
 */
export function useDealDriveRoom(dealId: string | undefined) {
  const [link, setLink] = useState<DriveFolderLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(true);
  const [nodes, setNodes] = useState<DriveNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const fetchLink = useCallback(async () => {
    if (!dealId) return;
    setLinkLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_drive_folders')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();
      if (error) throw error;
      setLink((data as unknown as DriveFolderLink) ?? null);
    } catch (err) {
      console.error('Failed to load Drive folder link:', err);
      setLink(null);
    } finally {
      setLinkLoading(false);
    }
  }, [dealId]);

  useEffect(() => { fetchLink(); }, [fetchLink]);

  const refreshTree = useCallback(async (folderId?: string) => {
    const target = folderId ?? link?.folder_id;
    if (!target) return;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await callDrive<{ nodes: DriveNode[]; truncated: boolean; root: { id: string; name: string } }>({
        action: 'tree',
        folderId: target,
      });
      setNodes(res.nodes ?? []);
      setTruncated(!!res.truncated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read the Drive folder';
      console.error('Drive tree failed:', msg);
      setTreeError(msg);
      setNodes([]);
    } finally {
      setTreeLoading(false);
    }
  }, [link?.folder_id]);

  useEffect(() => {
    if (link?.folder_id) refreshTree(link.folder_id);
    else setNodes([]);
  }, [link?.folder_id, refreshTree]);

  /** Suggest Drive folders whose name matches the deal / company. */
  const findMatches = useCallback(async (name: string, parentId: string | null = DRIVE_AUTOMATCH_ROOT_ID) => {
    if (!name.trim()) return [] as DriveMatch[];
    try {
      const res = await callDrive<{ matches: DriveMatch[] }>({ action: 'automatch', name, parentId });
      return res.matches ?? [];
    } catch (err) {
      console.error('Drive auto-match failed:', err);
      return [] as DriveMatch[];
    }
  }, []);

  const linkFolder = useCallback(async (folder: { id: string; name?: string; url?: string; autoMatched?: boolean }) => {
    if (!dealId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('deal_drive_folders')
      .upsert({
        deal_id: dealId,
        folder_id: folder.id,
        folder_name: folder.name ?? null,
        folder_url: folder.url ?? `https://drive.google.com/drive/folders/${folder.id}`,
        auto_matched: !!folder.autoMatched,
        linked_by: user?.id ?? null,
      } as any, { onConflict: 'deal_id' })
      .select()
      .single();
    if (error) {
      toast.error('Could not link that Drive folder', { description: error.message });
      return;
    }
    setLink(data as unknown as DriveFolderLink);
    toast.success('Data room connected to Google Drive', {
      description: folder.name ? `Showing live contents of "${folder.name}".` : undefined,
    });
  }, [dealId]);

  const unlinkFolder = useCallback(async () => {
    if (!dealId) return;
    const { error } = await supabase.from('deal_drive_folders').delete().eq('deal_id', dealId);
    if (error) {
      toast.error('Could not unlink the Drive folder', { description: error.message });
      return;
    }
    setLink(null);
    setNodes([]);
    toast.success('Drive folder disconnected');
  }, [dealId]);

  /** Fetch a Drive file's bytes through the gateway and hand back a blob URL. */
  const getFileBlobUrl = useCallback(async (node: DriveNode) => {
    const res = await callDrive<{ base64: string; mimeType: string }>({
      action: 'download',
      fileId: node.id,
      mimeType: node.mimeType,
    });
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return {
      url: URL.createObjectURL(new Blob([bytes], { type: res.mimeType })),
      mimeType: res.mimeType,
    };
  }, []);

  /** Distinct folder paths present in the linked folder, sorted. */
  const folderPaths = useMemo(
    () => nodes.filter(n => n.isFolder).map(n => n.path).sort((a, b) => a.localeCompare(b)),
    [nodes],
  );

  const files = useMemo(() => nodes.filter(n => !n.isFolder), [nodes]);

  return {
    link,
    linkLoading,
    nodes,
    files,
    folderPaths,
    treeLoading,
    treeError,
    truncated,
    refreshTree,
    findMatches,
    linkFolder,
    unlinkFolder,
    getFileBlobUrl,
  };
}
