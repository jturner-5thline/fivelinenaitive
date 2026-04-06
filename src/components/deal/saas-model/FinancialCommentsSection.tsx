import { MessageSquare, FileSpreadsheet, Wallet, Trash2 } from 'lucide-react';
import { FinancialComment } from '@/hooks/useFinancialComments';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface FinancialCommentsSectionProps {
  comments: FinancialComment[];
  onDelete?: (id: string) => Promise<void>;
  compact?: boolean;
}

export function FinancialCommentsSection({ comments, onDelete, compact = false }: FinancialCommentsSectionProps) {
  if (comments.length === 0) return null;

  const statementLabel = (type: string) =>
    type === 'income_statement' ? 'Income Statement' : 'Balance Sheet';

  const StatementIcon = (type: string) =>
    type === 'income_statement' ? FileSpreadsheet : Wallet;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4 text-primary" />
        Financial Comments ({comments.length})
      </div>

      <div className="space-y-2">
        {comments.map(c => {
          const Icon = StatementIcon(c.statement_type);
          return (
            <div
              key={c.id}
              className="rounded-lg border p-3 group relative"
              style={{
                background: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border) / 0.3)',
              }}
            >
              <div className="flex items-start gap-2.5">
                <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Commenting on
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {c.target_label}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {statementLabel(c.statement_type)}
                  </div>
                  <p className="text-sm text-foreground mt-1.5">
                    {c.comment_text}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                    <span className="font-medium">{c.created_by_name}</span>
                    <span>•</span>
                    <span>{format(new Date(c.created_at), 'MMM d, yyyy \'at\' h:mm a')}</span>
                  </div>
                </div>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
