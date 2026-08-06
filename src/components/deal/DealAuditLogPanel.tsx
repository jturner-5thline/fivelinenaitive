import { useState, useMemo } from 'react';
import {
  Upload, Trash2, FolderInput, Pencil, Share2, FolderPlus, CheckSquare,
  Square, FileText, Clock, RotateCcw, Filter, User, Search, Undo2, Video,
  ArrowRightFromLine, ArrowLeftFromLine, Loader2, GitBranch, ArrowRight, CheckCircle,
  Landmark, Unlink, ArrowRightLeft, X, FileSignature, ListTodo
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';
import type { DealAuditEntry } from '@/hooks/useDealAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DealAuditLogPanelProps {
  entries: DealAuditEntry[];
  unresolvedStageEntries?: DealAuditEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRestore?: (entry: DealAuditEntry) => Promise<void>;
  onRevert?: (entry: DealAuditEntry) => Promise<void>;
}

const ACTION_CONFIG: Record<string, { icon: typeof Upload; color: string; label: string }> = {
  file_uploaded: { icon: Upload, color: 'text-green-500', label: 'File Uploaded' },
  file_deleted: { icon: Trash2, color: 'text-destructive', label: 'File Deleted' },
  file_restored: { icon: RotateCcw, color: 'text-emerald-400', label: 'File Restored' },
  file_moved: { icon: FolderInput, color: 'text-blue-400', label: 'File Moved' },
  file_renamed: { icon: Pencil, color: 'text-amber-400', label: 'File Renamed' },
  file_shared_to_dataroom: { icon: ArrowRightFromLine, color: 'text-primary', label: 'Shared to Dataroom' },
  file_unshared_from_dataroom: { icon: ArrowLeftFromLine, color: 'text-amber-500', label: 'Unshared from Dataroom' },
  folder_created: { icon: FolderPlus, color: 'text-cyan-400', label: 'Folder Created' },
  folder_deleted: { icon: Trash2, color: 'text-destructive', label: 'Folder Deleted' },
  folder_renamed: { icon: Pencil, color: 'text-amber-400', label: 'Folder Renamed' },
  checklist_item_checked: { icon: CheckSquare, color: 'text-green-500', label: 'Checklist Checked' },
  checklist_item_unchecked: { icon: Square, color: 'text-muted-foreground', label: 'Checklist Unchecked' },
  deal_status_changed: { icon: FileText, color: 'text-purple-400', label: 'Status Changed' },
  deal_info_updated: { icon: Pencil, color: 'text-amber-400', label: 'Deal Updated' },
  move_reverted: { icon: Undo2, color: 'text-cyan-400', label: 'Move Reverted' },
  rename_reverted: { icon: Undo2, color: 'text-cyan-400', label: 'Rename Reverted' },
  claap_recording_linked: { icon: Video, color: 'text-primary', label: 'Call Linked' },
  stage_changed: { icon: GitBranch, color: 'text-muted-foreground', label: 'Stage Changed' },
  stage_exited: { icon: GitBranch, color: 'text-muted-foreground', label: 'Stage Exited' },
  deal_created: { icon: CheckCircle, color: 'text-primary', label: 'Deal Created' },
  lender_added: { icon: Landmark, color: 'text-emerald-400', label: 'Funding Source Added' },
  lender_updated: { icon: Landmark, color: 'text-amber-400', label: 'Funding Source Updated' },
  lender_removed: { icon: Unlink, color: 'text-destructive', label: 'Funding Source Removed' },
  lender_deleted: { icon: Unlink, color: 'text-destructive', label: 'Funding Source Removed' },
  lender_stage_change: { icon: ArrowRightLeft, color: 'text-blue-400', label: 'Funding Source Stage Changed' },
  lender_substage_change: { icon: ArrowRightLeft, color: 'text-blue-400', label: 'Funding Source Sub-stage Changed' },
  lender_status_change: { icon: ArrowRightLeft, color: 'text-blue-400', label: 'Funding Source Status Changed' },
  lender_notes_updated: { icon: FileText, color: 'text-amber-400', label: 'Funding Source Notes Updated' },
  lender_passed: { icon: X, color: 'text-destructive', label: 'Funding Source Passed' },
  lender_terms_received: { icon: FileSignature, color: 'text-primary', label: 'Terms Received' },
  task_created: { icon: ListTodo, color: 'text-cyan-400', label: 'Task Created' },
  task_updated: { icon: Pencil, color: 'text-amber-400', label: 'Task Updated' },
  task_completed: { icon: CheckSquare, color: 'text-green-500', label: 'Task Completed' },
  task_removed: { icon: Trash2, color: 'text-destructive', label: 'Task Removed' },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'stage_change', label: 'Stage changes only' },
  { value: 'file', label: 'Files' },
  { value: 'folder', label: 'Folders' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'deal', label: 'Deal' },
  { value: 'call', label: 'Calls' },
  { value: 'funding_source', label: 'Funding sources' },
  { value: 'task', label: 'Tasks' },
];

function describeAction(entry: DealAuditEntry): string {
  const name = entry.entity_name || 'an item';
  const meta = entry.metadata || {};
  switch (entry.action_type) {
    case 'file_uploaded': return `uploaded "${name}"${meta.folder ? ` to ${meta.folder}` : ''}`;
    case 'file_deleted': return `deleted "${name}"`;
    case 'file_restored': return `restored "${name}"`;
    case 'file_moved': return `moved "${name}" from ${meta.old_folder || '?'} to ${meta.new_folder || '?'}`;
    case 'file_renamed': return `renamed "${meta.old_name || '?'}" to "${meta.new_name || name}"`;
    case 'file_shared_to_dataroom': return `shared "${name}" to Dataroom`;
    case 'file_unshared_from_dataroom': return `unshared "${name}" from Dataroom`;
    case 'folder_created': return `created folder "${name}"`;
    case 'folder_deleted': return `deleted folder "${name}"`;
    case 'folder_renamed': return `renamed folder "${meta.old_name}" to "${meta.new_name || name}"`;
    case 'checklist_item_checked': return `checked "${name}"`;
    case 'checklist_item_unchecked': return `unchecked "${name}"`;
    case 'deal_status_changed': return `changed status from "${meta.old_status}" to "${meta.new_status}"`;
    case 'deal_info_updated': return `updated deal info: ${meta.field || ''}`;
    case 'deal_created': return 'created the deal';
    case 'move_reverted': return `reverted move of "${name}" back to ${meta.old_folder || '?'}`;
    case 'rename_reverted': return `reverted rename of "${name}" back to "${meta.old_name || '?'}"`;
    case 'claap_recording_linked': return entry.metadata?.recording_url ? `linked Claap call "${name}"` : name;
    case 'stage_changed': {
      const fromL = meta.from_label || (meta.from_stage ? String(meta.from_stage).replace(/-/g, ' ') : null);
      const toL = meta.to_label || (meta.to_stage ? String(meta.to_stage).replace(/-/g, ' ') : name);
      if (fromL && fromL !== '—') return `moved stage from "${fromL}" to "${toL}"`;
      return `set stage to "${toL}"`;
    }
    case 'stage_exited': {
      const exitL = meta.exit_stage_label || name || 'a stage';
      return `exited stage "${exitL}"`;
    }
    case 'task_created': {
      const due = meta.due_date ? ` (due ${format(new Date(meta.due_date), 'MMM d, yyyy')})` : '';
      const who = meta.assignee_name ? ` for ${meta.assignee_name}` : '';
      return `created task "${name}"${who}${due}`;
    }
    case 'task_updated': return `updated task "${name}"`;
    case 'task_completed': return `completed task "${name}"`;
    case 'task_removed': return `removed task "${name}"`;
    default: return entry.action_type.replace(/_/g, ' ');
  }
}

function isRestorable(entry: DealAuditEntry): boolean {
  if (entry.action_type !== 'file_deleted') return false;
  const deletedAt = new Date(entry.created_at);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  return deletedAt > fourteenDaysAgo;
}

function isRevertable(entry: DealAuditEntry): boolean {
  return ['file_moved', 'file_renamed', 'folder_renamed'].includes(entry.action_type);
}

export function DealAuditLogPanel({ entries, unresolvedStageEntries = [], loading, hasMore, onLoadMore, onRestore, onRevert }: DealAuditLogPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showUnresolved, setShowUnresolved] = useState(false);

  const filtered = useMemo(() => {
    let result = entries;
    if (activeFilter !== 'all') {
      result = result.filter(e => e.entity_type === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.entity_name || '').toLowerCase().includes(q) ||
        (e.user_display_name || '').toLowerCase().includes(q) ||
        describeAction(e).toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, activeFilter, searchQuery]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; items: DealAuditEntry[] }[] = [];
    const map = new Map<string, DealAuditEntry[]>();
    for (const entry of filtered) {
      const d = new Date(entry.created_at);
      let label: string;
      if (isToday(d)) label = 'Today';
      else if (isYesterday(d)) label = 'Yesterday';
      else label = format(d, 'MMM d, yyyy');
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }
    map.forEach((items, label) => groups.push({ label, items }));
    return groups;
  }, [filtered]);

  const handleRestore = async (entry: DealAuditEntry) => {
    if (!onRestore) return;
    setProcessingId(entry.id);
    try { await onRestore(entry); } finally { setProcessingId(null); }
  };

  const handleRevert = async (entry: DealAuditEntry) => {
    if (!onRevert) return;
    setProcessingId(entry.id);
    try { await onRevert(entry); } finally { setProcessingId(null); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border/30 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                activeFilter === opt.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/30 text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {unresolvedStageEntries.length > 0 && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
              <button
                type="button"
                onClick={() => setShowUnresolved((s) => !s)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-amber-700 dark:text-amber-300"
              >
                <span>Unresolved stage events ({unresolvedStageEntries.length})</span>
                <span className="text-[10px] opacity-70">{showUnresolved ? 'Hide' : 'Show'}</span>
              </button>
              {showUnresolved && (
                <ul className="mt-2 space-y-1">
                  {unresolvedStageEntries.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-foreground truncate">
                        “{u.metadata?.unresolved_stage_label || u.metadata?.to_stage_label_raw || u.metadata?.to_stage || '—'}”
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {format(new Date(u.created_at), 'MMM d, yyyy')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                These imported events don't map to a real stage in Active Deals or In Development. Hidden from the main feed.
              </p>
            </div>
          )}
          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <Clock className="h-5 w-5 mx-auto mb-1 opacity-50" />
              {activeFilter === 'stage_change'
                ? 'No stage changes yet — stage transitions will appear here as the deal progresses.'
                : 'No activity yet'}
            </div>
          )}
          {grouped.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(entry => {
                  const config = ACTION_CONFIG[entry.action_type] || { icon: FileText, color: 'text-muted-foreground', label: entry.action_type };
                  const Icon = config.icon;
                  const restorable = isRestorable(entry);
                  const revertable = isRevertable(entry);
                  const isProcessing = processingId === entry.id;

                  if (entry.action_type === 'stage_changed' || entry.action_type === 'stage_exited') {
                    const meta = entry.metadata || {};
                    const isExit = entry.action_type === 'stage_exited';
                    const fromLabel = meta.from_label || (meta.from_stage ? String(meta.from_stage).replace(/-/g, ' ') : null);
                    const toLabel = meta.to_label || (meta.to_stage ? String(meta.to_stage).replace(/-/g, ' ') : entry.entity_name) || 'Unknown';
                    const exitLabel = meta.exit_stage_label || entry.entity_name || 'a stage';
                    const hasFrom = fromLabel && fromLabel !== '—';
                    const isBackfill = meta.source === 'backfill' || meta.source === 'backfill_exit';
                    const who = isBackfill
                      ? 'System (backfill)'
                      : entry.user_display_name?.trim();
                    return (
                      <div key={entry.id} className="group flex items-start gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-muted/30 transition-colors">
                        <div className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 bg-muted/50">
                          <GitBranch className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed">
                            {isExit ? (
                              <>
                                <span className="text-muted-foreground">Exited</span>
                                <span className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded border border-border/60 bg-muted/70 text-[11px] font-medium text-foreground break-words">
                                  {exitLabel}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="flex flex-col gap-1 w-full">
                                  {hasFrom && (
                                    <div className="flex flex-wrap items-center gap-x-1.5">
                                      <span className="text-muted-foreground">Exited</span>
                                      <span className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded border border-border/40 bg-muted/40 text-[11px] text-muted-foreground break-words">
                                        {fromLabel}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-x-1.5">
                                    <span className="text-muted-foreground">Entered</span>
                                    <span className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded border border-border/60 bg-muted/70 text-[11px] font-medium text-foreground break-words">
                                      {toLabel}
                                    </span>
                                  </div>
                                </div>
                              </>
                            )}
                            {isBackfill && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                Backfilled
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                            {who && <><span>{who}</span><span aria-hidden>·</span></>}
                            <span>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={entry.id} className="group flex items-start gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-muted/30 transition-colors">
                      <div className={cn("flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 bg-muted/50")}>
                        <Icon className={cn("h-3 w-3", config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        {entry.action_type === 'deal_created' ? (
                          <p className="text-xs leading-relaxed">
                            <span className="font-medium">Deal Created</span>
                            <span className="text-muted-foreground"> · {entry.user_display_name || 'System'}</span>
                          </p>
                        ) : (
                          <p className="text-xs leading-relaxed">
                            <span className="font-medium">{entry.user_display_name || 'System'}</span>
                            {' '}
                            <span className="text-muted-foreground">{describeAction(entry)}</span>
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                          </span>
                          {(restorable || revertable) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              disabled={isProcessing}
                              onClick={() => restorable ? handleRestore(entry) : handleRevert(entry)}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                                  {restorable ? 'Restore' : 'Revert'}
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center py-2">
              <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading} className="text-xs">
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
