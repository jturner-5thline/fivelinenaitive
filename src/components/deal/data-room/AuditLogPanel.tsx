import { Clock, Upload, Download, Link2, Unlink, Trash2, Eye, FileText, UserCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from './helpers';
import type { AuditEntry } from '@/hooks/useDataRoomAudit';

interface AuditLogPanelProps {
  entries: AuditEntry[];
  loading: boolean;
}

const ACTION_ICONS: Record<string, typeof Upload> = {
  upload: Upload,
  download: Download,
  delete: Trash2,
  map: Link2,
  unmap: Unlink,
  preview: Eye,
  export: FileText,
  comment: FileText,
};

const ACTION_COLORS: Record<string, string> = {
  upload: 'text-green-500',
  download: 'text-blue-500',
  delete: 'text-destructive',
  map: 'text-primary',
  unmap: 'text-amber-500',
  preview: 'text-purple-500',
  export: 'text-muted-foreground',
  comment: 'text-muted-foreground',
};

export function AuditLogPanel({ entries, loading }: AuditLogPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        <Clock className="h-5 w-5 mx-auto mb-1 opacity-50" />
        No activity yet
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-1 pr-2">
        {entries.map(entry => {
          const Icon = ACTION_ICONS[entry.action] || FileText;
          const colorClass = ACTION_COLORS[entry.action] || 'text-muted-foreground';

          return (
            <div key={entry.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
              <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${colorClass}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs">
                  <span className="font-medium">{entry.user_display_name || 'System'}</span>
                  {' '}
                  <span className="text-muted-foreground">{describeAction(entry)}</span>
                </p>
                {entry.target_name && (
                  <p className="text-[10px] text-muted-foreground truncate">{entry.target_name}</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(entry.created_at)}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function describeAction(entry: AuditEntry): string {
  switch (entry.action) {
    case 'upload': return `uploaded ${entry.target_type === 'file' ? 'a file' : entry.target_type}`;
    case 'download': return `downloaded ${entry.target_name || 'a file'}`;
    case 'delete': return `deleted ${entry.target_name || 'a file'}`;
    case 'map': return `mapped a file to checklist item`;
    case 'unmap': return `unmapped a file`;
    case 'preview': return `previewed ${entry.target_name || 'a file'}`;
    case 'export': return `exported checklist index`;
    case 'comment': return `commented on ${entry.target_name || 'an item'}`;
    case 'share_link_created': return `created a share link`;
    default: return entry.action;
  }
}
