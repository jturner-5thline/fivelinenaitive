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
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import {
  Mail, MailOpen, Star, Archive, Trash2, Tag, Check, Plus, ListChecks,
  Reply, ReplyAll, Forward, Link2, Link2Off, Copy, AtSign,
  FolderInput, Clock, AlertOctagon, ShieldOff, Pin, PinOff, AlertCircle,
  FolderOpen, Inbox as InboxIcon, Send as SendIcon, FileText,
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
  // Toggles for extended Outlook-style actions. Optional so existing
  // call-sites (e.g. DailyBriefingModal) keep compiling.
  isImportant?: boolean;
  isPinned?: boolean;
  onOpen?: () => void;
  onToggleImportant?: () => void;
  onTogglePin?: () => void;
  onSnooze?: (preset: '1h' | 'tomorrow' | 'next-week' | 'custom') => void;
  onMoveTo?: (folder: 'inbox' | 'archive' | 'spam' | 'trash' | 'drafts') => void;
  onBlockSender?: () => void;
  onReportSpam?: () => void;
  onLinkToDeal?: () => void;
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
  isImportant = false,
  isPinned = false,
  onOpen,
  onToggleImportant,
  onTogglePin,
  onSnooze,
  onMoveTo,
  onBlockSender,
  onReportSpam,
  onLinkToDeal,
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

  // Soft-fallback for actions whose backend wiring isn't in place yet.
  // Keeps the menu feeling complete while making it obvious nothing was
  // mutated server-side. Replace with real handlers as backends land.
  const comingSoon = (label: string) => () =>
    toast.info(`${label} — coming soon`, {
      description: 'Action recognized, persistence is still being wired up.',
    });

  // ── Bulk mode (right-click on a row that's part of a multi-selection) ──
  if (isInBulkSelection && selectedCount > 1) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel className="text-[11px] text-muted-foreground font-normal">
            {selectedCount} messages selected
          </ContextMenuLabel>
          <ContextMenuSeparator />
          {onBulkMarkRead && (
            <ContextMenuItem onClick={onBulkMarkRead} className="gap-2 text-xs">
              <MailOpen className="h-3.5 w-3.5" /> Mark as Read
              <ContextMenuShortcut>R</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          {onBulkMarkUnread && (
            <ContextMenuItem onClick={onBulkMarkUnread} className="gap-2 text-xs">
              <Mail className="h-3.5 w-3.5" /> Mark as Unread
              <ContextMenuShortcut>⇧U</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {onBulkArchive && (
            <ContextMenuItem onClick={onBulkArchive} className="gap-2 text-xs">
              <Archive className="h-3.5 w-3.5" /> Archive
              <ContextMenuShortcut>E</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          {onBulkDelete && (
            <ContextMenuItem onClick={onBulkDelete} className="gap-2 text-xs text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Delete
              <ContextMenuShortcut>#</ContextMenuShortcut>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {onOpen && (
          <ContextMenuItem onClick={onOpen} className="gap-2 text-xs">
            <FolderOpen className="h-3.5 w-3.5" />
            Open
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {onOpen && <ContextMenuSeparator />}
        {isRead ? (
          <ContextMenuItem onClick={onMarkUnread} className="gap-2 text-xs">
            <Mail className="h-3.5 w-3.5" />
            Mark as Unread
            <ContextMenuShortcut>⇧U</ContextMenuShortcut>
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={onMarkRead} className="gap-2 text-xs">
            <MailOpen className="h-3.5 w-3.5" />
            Mark as Read
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={onToggleImportant ?? comingSoon('Mark as important')}
          className="gap-2 text-xs"
        >
          <AlertCircle
            className={`h-3.5 w-3.5 ${isImportant ? 'fill-amber-400 text-amber-500' : ''}`}
          />
          {isImportant ? 'Remove importance' : 'Mark as important'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleStar} className="gap-2 text-xs">
          <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
          {isStarred ? 'Unflag' : 'Flag'}
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onTogglePin ?? comingSoon('Pin to top')}
          className="gap-2 text-xs"
        >
          {isPinned
            ? <PinOff className="h-3.5 w-3.5" />
            : <Pin className="h-3.5 w-3.5" />}
          {isPinned ? 'Unpin' : 'Pin to top'}
        </ContextMenuItem>

        {(onReply || onReplyAll || onForward) && (
          <>
            <ContextMenuSeparator />
            {onReply && (
              <ContextMenuItem onClick={onReply} className="gap-2 text-xs">
                <Reply className="h-3.5 w-3.5" /> Reply
                <ContextMenuShortcut>R</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {onReplyAll && (
              <ContextMenuItem onClick={onReplyAll} className="gap-2 text-xs">
                <ReplyAll className="h-3.5 w-3.5" /> Reply All
                <ContextMenuShortcut>A</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {onForward && (
              <ContextMenuItem onClick={onForward} className="gap-2 text-xs">
                <Forward className="h-3.5 w-3.5" /> Forward
                <ContextMenuShortcut>F</ContextMenuShortcut>
              </ContextMenuItem>
            )}
          </>
        )}

        {/* Snooze / Archive / Move / Label cluster */}
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2 text-xs">
            <Clock className="h-3.5 w-3.5" />
            Snooze
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem
              onClick={onSnooze ? () => onSnooze('1h') : comingSoon('Snooze 1 hour')}
              className="text-xs"
            >
              1 hour
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onSnooze ? () => onSnooze('tomorrow') : comingSoon('Snooze until tomorrow')}
              className="text-xs"
            >
              Tomorrow morning
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onSnooze ? () => onSnooze('next-week') : comingSoon('Snooze next week')}
              className="text-xs"
            >
              Next week
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={onSnooze ? () => onSnooze('custom') : comingSoon('Snooze custom')}
              className="text-xs"
            >
              Custom…
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={onArchive} className="gap-2 text-xs">
          <Archive className="h-3.5 w-3.5" />
          Archive
          <ContextMenuShortcut>E</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2 text-xs">
            <FolderInput className="h-3.5 w-3.5" />
            Move to
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem
              onClick={onMoveTo ? () => onMoveTo('inbox') : comingSoon('Move to Inbox')}
              className="gap-2 text-xs"
            >
              <InboxIcon className="h-3.5 w-3.5" /> Inbox
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onMoveTo ? () => onMoveTo('archive') : comingSoon('Move to Archive')}
              className="gap-2 text-xs"
            >
              <Archive className="h-3.5 w-3.5" /> Archive
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onMoveTo ? () => onMoveTo('drafts') : comingSoon('Move to Drafts')}
              className="gap-2 text-xs"
            >
              <FileText className="h-3.5 w-3.5" /> Drafts
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onMoveTo ? () => onMoveTo('spam') : comingSoon('Move to Spam')}
              className="gap-2 text-xs"
            >
              <AlertOctagon className="h-3.5 w-3.5" /> Spam
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onMoveTo ? () => onMoveTo('trash') : comingSoon('Move to Trash')}
              className="gap-2 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" /> Trash
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {threadId && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2 text-xs">
                <Tag className="h-3.5 w-3.5" />
                Add label
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

        {/* Link / Task / Save cluster */}
        {(onLinkToDeal || onCreateTask || onSaveToDeal) && (
          <>
            <ContextMenuSeparator />
            {onLinkToDeal && (
              <ContextMenuItem onClick={onLinkToDeal} className="gap-2 text-xs">
                <Link2 className="h-3.5 w-3.5" />
                Link to Deal…
              </ContextMenuItem>
            )}
            {onCreateTask && (
              <ContextMenuItem onClick={onCreateTask} className="gap-2 text-xs">
                <ListChecks className="h-3.5 w-3.5" />
                Create Task from email
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
        <ContextMenuItem
          onClick={onBlockSender ?? comingSoon('Block sender')}
          className="gap-2 text-xs"
        >
          <ShieldOff className="h-3.5 w-3.5" />
          Block sender
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onReportSpam ?? comingSoon('Report spam')}
          className="gap-2 text-xs"
        >
          <AlertOctagon className="h-3.5 w-3.5" />
          Report spam
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
          <ContextMenuShortcut>#</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
