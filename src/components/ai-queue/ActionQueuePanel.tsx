import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  X,
  Pencil,
  CheckCheck,
  Inbox as InboxIcon,
  Clock,
  Briefcase,
  CheckSquare,
  FileText,
  Building2,
  Save,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import {
  QueuedAiAction,
  AiActionType,
  useApproveAiAction,
  useApproveAllAiActions,
  useDismissAiAction,
  useUpdateAiAction,
} from '@/hooks/useAiActionQueue';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const TYPE_META: Record<AiActionType, { label: string; icon: typeof CheckSquare; color: string }> = {
  create_task: { label: 'Create Task', icon: CheckSquare, color: 'text-sky-500' },
  update_lender_status: { label: 'Update Lender', icon: Building2, color: 'text-emerald-500' },
  save_to_data_room: { label: 'Save to Data Room', icon: Save, color: 'text-violet-500' },
  log_note: { label: 'Log Note', icon: FileText, color: 'text-amber-500' },
  deal_update: { label: 'Update Deal', icon: Briefcase, color: 'text-blue-500' },
};

function expiryLabel(item: QueuedAiAction): string {
  const ms = new Date(item.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  return `expires in ${formatDistanceToNowStrict(new Date(item.expires_at))}`;
}

interface PanelProps {
  items: QueuedAiAction[];
  onClose?: () => void;
}

export function ActionQueuePanel({ items, onClose }: PanelProps) {
  const approve = useApproveAiAction();
  const approveAll = useApproveAllAiActions();
  const dismiss = useDismissAiAction();
  const updateItem = useUpdateAiAction();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Group by deal (or "Unassigned")
  const grouped = useMemo(() => {
    const map = new Map<string, { dealId: string | null; dealName: string; items: QueuedAiAction[] }>();
    for (const it of items) {
      const key = it.deal_id || '__none__';
      const name = it.deal_name || (it.deal_id ? 'Untitled Deal' : 'Unassigned');
      if (!map.has(key)) map.set(key, { dealId: it.deal_id, dealName: name, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => a.dealName.localeCompare(b.dealName));
  }, [items]);

  const startEdit = (item: QueuedAiAction) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateItem(editingId, { title: editTitle, description: editDesc });
    setEditingId(null);
  };

  return (
    <>
      <div className="px-3 py-2.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-muted-foreground" />
          <p className="font-medium text-sm">Action Queue</p>
          {items.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {items.length}
            </Badge>
          )}
        </div>
        {items.length > 0 && (
          <Button
            size="sm"
            variant="default"
            className="h-7 gap-1 text-[11px]"
            disabled={bulkBusy}
            onClick={async () => {
              setBulkBusy(true);
              await approveAll(items);
              setBulkBusy(false);
            }}
          >
            {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
            Approve all
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
          <InboxIcon className="h-6 w-6 opacity-50" />
          <p className="text-sm">Your queue is empty.</p>
          <p className="text-xs">
            Use “Add to Queue” on any AI suggestion to defer it for batch review.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-2 space-y-3">
            {grouped.map(group => (
              <div key={group.dealId || '__none__'} className="rounded-md border border-border/50 bg-muted/20">
                <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-border/40">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.dealName}
                    </span>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">{group.items.length}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={async () => {
                      setBulkBusy(true);
                      await approveAll(group.items);
                      setBulkBusy(false);
                    }}
                    disabled={bulkBusy}
                  >
                    Approve group
                  </Button>
                </div>
                <ul className="divide-y divide-border/40">
                  {group.items.map(item => {
                    const meta = TYPE_META[item.action_type];
                    const Icon = meta?.icon ?? CheckSquare;
                    const isEditing = editingId === item.id;
                    return (
                      <li key={item.id} className="p-2.5 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta?.color || ''}`} />
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <Input
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  className="h-7 text-xs"
                                />
                                <Textarea
                                  value={editDesc}
                                  onChange={e => setEditDesc(e.target.value)}
                                  className="min-h-[44px] text-xs"
                                />
                              </div>
                            ) : (
                              <>
                                <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                                {item.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
                                )}
                              </>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              <span className="uppercase tracking-wide">{meta?.label}</span>
                              <span>·</span>
                              <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{expiryLabel(item)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                              <Button size="sm" variant="default" className="h-6 px-2 text-[10px] gap-1" onClick={saveEdit}>
                                <Save className="h-3 w-3" /> Save
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1 text-muted-foreground" onClick={() => startEdit(item)}>
                                <Pencil className="h-3 w-3" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                                onClick={() => dismiss(item.id)}
                              >
                                <X className="h-3 w-3" /> Dismiss
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-6 px-2 text-[10px] gap-1"
                                disabled={busyId === item.id}
                                onClick={async () => {
                                  setBusyId(item.id);
                                  await approve(item);
                                  setBusyId(null);
                                }}
                              >
                                {busyId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Approve
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  );
}