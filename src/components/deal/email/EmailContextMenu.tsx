import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuLabel,
} from '@/components/ui/context-menu';
import {
  Mail, MailOpen, Star, Archive, Trash2, Tag, Check, Plus, ListChecks,
  Reply, ReplyAll, Forward, Link2, Link2Off, Copy, AtSign,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  useLabels,
  useAllLabelAssignments,
  useApplyLabel,
  useRemoveLabel,
  useCreateLabel,
} from '@/hooks/useEmailLabels';
import { labelSwatch } from './EmailLabelsManageDialog';

interface EmailContextMenuProps {
  children: React.ReactNode;
  isRead: boolean;
  isStarred: boolean;
  threadId?: string;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCreateTask?: () => void;
  // Reply / forward
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  // Save Email to Deal (toggles link)
  onSaveToDeal?: () => void;
  isLinkedToDeal?: boolean;
  // Clipboard helpers
  subject?: string;
  fromEmail?: string;
  // Multi-select
  selectedCount?: number;
  isInBulkSelection?: boolean;
  onBulkMarkRead?: () => void;
  onBulkMarkUnread?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
}

export function EmailContextMenu({
  children,
  isRead,
  isStarred,
  threadId,
  onMarkRead,
  onMarkUnread,
  onToggleStar,
  onArchive,
  onDelete,
  onCreateTask,
  onReply,
  onReplyAll,
  onForward,
  onSaveToDeal,
  isLinkedToDeal,
  subject,
  fromEmail,
  selectedCount = 0,
  isInBulkSelection = false,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkArchive,
  onBulkDelete,
}: EmailContextMenuProps) {
  const { data: labels = [] } = useLabels();
  const { data: assignments = [] } = useAllLabelAssignments();
  const apply = useApplyLabel();
  const remove = useRemoveLabel();
  const create = useCreateLabel();
  const [newLabelName, setNewLabelName] = useState('');

  const appliedSet = useMemo(() => {
    if (!threadId) return new Set<string>();
    return new Set(
      assignments.filter((a) => a.thread_id === threadId).map((a) => a.label_id),
    );
  }, [assignments, threadId]);

  const toggleLabel = (labelId: string) => {
    if (!threadId) return;
    if (appliedSet.has(labelId)) {
      remove.mutate({ threadId, labelId });
    } else {
      apply.mutate({ threadId, labelId });
    }
  };

  const handleCreate = async () => {
    const name = newLabelName.trim();
    if (!name || !threadId) return;
    try {
      const created = await create.mutateAsync({ name });
      await apply.mutateAsync({ threadId, labelId: created.id });
      setNewLabelName('');
      toast.success(`Applied "${created.name}"`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not create label');
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  };

  // ── Bulk mode (right-click on a row that's part of a multi-selection) ──
  if (isInBulkSelection && selectedCount > 1) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel className="text-[11px] text-muted-foreground font-normal">
            {selectedCount} selected
          </ContextMenuLabel>
          <ContextMenuSeparator />
          {onBulkMarkRead && (
            <ContextMenuItem onClick={onBulkMarkRead} className="gap-2 text-xs">
              <MailOpen className="h-3.5 w-3.5" /> Mark as Read
            </ContextMenuItem>
          )}
          {onBulkMarkUnread && (
            <ContextMenuItem onClick={onBulkMarkUnread} className="gap-2 text-xs">
              <Mail className="h-3.5 w-3.5" /> Mark as Unread
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {onBulkArchive && (
            <ContextMenuItem onClick={onBulkArchive} className="gap-2 text-xs">
              <Archive className="h-3.5 w-3.5" /> Archive
            </ContextMenuItem>
          )}
          {onBulkDelete && (
            <ContextMenuItem onClick={onBulkDelete} className="gap-2 text-xs text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {isRead ? (
          <ContextMenuItem onClick={onMarkUnread} className="gap-2 text-xs">
            <Mail className="h-3.5 w-3.5" />
            Mark as Unread
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={onMarkRead} className="gap-2 text-xs">
            <MailOpen className="h-3.5 w-3.5" />
            Mark as Read
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onToggleStar} className="gap-2 text-xs">
          <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
          {isStarred ? 'Unstar' : 'Star'}
        </ContextMenuItem>

        {(onReply || onReplyAll || onForward) && (
          <>
            <ContextMenuSeparator />
            {onReply && (
              <ContextMenuItem onClick={onReply} className="gap-2 text-xs">
                <Reply className="h-3.5 w-3.5" /> Reply
              </ContextMenuItem>
            )}
            {onReplyAll && (
              <ContextMenuItem onClick={onReplyAll} className="gap-2 text-xs">
                <ReplyAll className="h-3.5 w-3.5" /> Reply All
              </ContextMenuItem>
            )}
            {onForward && (
              <ContextMenuItem onClick={onForward} className="gap-2 text-xs">
                <Forward className="h-3.5 w-3.5" /> Forward
              </ContextMenuItem>
            )}
          </>
        )}

        {(onCreateTask || onSaveToDeal) && (
          <>
            <ContextMenuSeparator />
            {onCreateTask && (
              <ContextMenuItem onClick={onCreateTask} className="gap-2 text-xs">
                <ListChecks className="h-3.5 w-3.5" />
                Create Task
              </ContextMenuItem>
            )}
            {onSaveToDeal && (
              <ContextMenuItem onClick={onSaveToDeal} className="gap-2 text-xs">
                {isLinkedToDeal
                  ? <Link2Off className="h-3.5 w-3.5" />
                  : <Link2 className="h-3.5 w-3.5" />}
                {isLinkedToDeal ? 'Unlink from Deal' : 'Save Email to Deal'}
              </ContextMenuItem>
            )}
          </>
        )}

        {threadId && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2 text-xs">
                <Tag className="h-3.5 w-3.5" />
                Labels
                {appliedSet.size > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground">{appliedSet.size}</span>
                )}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-56 max-h-[320px] overflow-y-auto">
                {labels.length === 0 && (
                  <ContextMenuLabel className="text-[11px] text-muted-foreground font-normal">
                    No labels yet — create one below
                  </ContextMenuLabel>
                )}
                {labels.map((l) => {
                  const applied = appliedSet.has(l.id);
                  return (
                    <ContextMenuItem
                      key={l.id}
                      onClick={(e) => { e.preventDefault(); toggleLabel(l.id); }}
                      className="gap-2 text-xs"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: labelSwatch(l.color) }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                      {applied && <Check className="h-3.5 w-3.5 text-foreground/70" />}
                    </ContextMenuItem>
                  );
                })}
                <ContextMenuSeparator />
                <div
                  className="flex items-center gap-1 px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="New label…"
                    maxLength={32}
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={handleCreate}
                    disabled={!newLabelName.trim() || create.isPending}
                    aria-label="Create and apply label"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        {(subject || fromEmail) && (
          <>
            <ContextMenuSeparator />
            {subject && (
              <ContextMenuItem
                onClick={() => copy(subject, 'Subject')}
                className="gap-2 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Subject
              </ContextMenuItem>
            )}
            {fromEmail && (
              <ContextMenuItem
                onClick={() => copy(fromEmail, 'Sender email')}
                className="gap-2 text-xs"
              >
                <AtSign className="h-3.5 w-3.5" />
                Copy Sender Email
              </ContextMenuItem>
            )}
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem onClick={onArchive} className="gap-2 text-xs">
          <Archive className="h-3.5 w-3.5" />
          Archive
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
