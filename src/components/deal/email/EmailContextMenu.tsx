import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Mail, MailOpen, Star, Archive, Trash2 } from 'lucide-react';

interface EmailContextMenuProps {
  children: React.ReactNode;
  isRead: boolean;
  isStarred: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function EmailContextMenu({
  children,
  isRead,
  isStarred,
  onMarkRead,
  onMarkUnread,
  onToggleStar,
  onArchive,
  onDelete,
}: EmailContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
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
