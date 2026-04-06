import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { FinancialComment, AddCommentParams } from '@/hooks/useFinancialComments';
import { formatDistanceToNow } from 'date-fns';

interface FinancialCommentPopoverProps {
  anchorKey: string;
  targetLabel: string;
  statementType: 'income_statement' | 'balance_sheet';
  lineItemKey: string;
  lineItemLabel: string;
  periodKey?: string | null;
  periodLabel?: string | null;
  anchorType?: 'row' | 'cell' | 'metric' | 'widget';
  existingComments: FinancialComment[];
  onAdd: (params: AddCommentParams) => Promise<FinancialComment | null>;
  onDelete: (id: string) => Promise<void>;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FinancialCommentPopover({
  anchorKey,
  targetLabel,
  statementType,
  lineItemKey,
  lineItemLabel,
  periodKey,
  periodLabel,
  existingComments,
  onAdd,
  onDelete,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: FinancialCommentPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await onAdd({
      statement_type: statementType,
      anchor_type: periodKey ? 'cell' : 'row',
      anchor_key: anchorKey,
      target_label: targetLabel,
      line_item_key: lineItemKey,
      line_item_label: lineItemLabel,
      period_key: periodKey,
      period_label: periodLabel,
      comment_text: text.trim(),
    });
    setText('');
    setSaving(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start" side="bottom">
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--map-text, hsl(var(--foreground)))' }}>
            <MessageSquare className="h-3.5 w-3.5" />
            Comments ({existingComments.length})
          </div>

          {/* Target label */}
          <div className="rounded px-2 py-1.5 text-[10px]"
            style={{
              background: 'var(--map-grid-soft, hsl(var(--muted) / 0.3))',
              border: '1px solid var(--map-border, hsl(var(--border) / 0.3))',
              color: 'var(--map-text-muted, hsl(var(--muted-foreground)))',
            }}
          >
            <span className="font-semibold uppercase tracking-wider" style={{ fontSize: '9px' }}>Commenting on</span>
            <div className="mt-0.5 font-medium" style={{ color: 'var(--map-text, hsl(var(--foreground)))', fontSize: '11px' }}>
              {targetLabel}
            </div>
          </div>

          {/* Existing comments */}
          {existingComments.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {existingComments.map(c => (
                <div key={c.id} className="rounded p-2 text-xs group relative"
                  style={{
                    background: 'var(--map-surface-2, hsl(var(--muted) / 0.1))',
                    border: '1px solid var(--map-border, hsl(var(--border) / 0.15))',
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-[10px]" style={{ color: 'var(--map-text, hsl(var(--foreground)))' }}>
                      {c.created_by_name}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--map-text-faint, hsl(var(--muted-foreground) / 0.5))' }}>
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--map-text-secondary, hsl(var(--muted-foreground)))' }}>
                    {c.comment_text}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a comment..."
            className="text-xs min-h-[60px] resize-none"
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
          />
          <Button
            size="sm"
            className="h-7 w-full text-xs gap-1"
            onClick={handleSubmit}
            disabled={!text.trim() || saving}
          >
            <Send className="h-3 w-3" /> {saving ? 'Saving...' : 'Add Comment'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
