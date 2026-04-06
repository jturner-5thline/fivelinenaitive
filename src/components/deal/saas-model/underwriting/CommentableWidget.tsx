import React, { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MessageSquare } from 'lucide-react';
import { FinancialCommentPopover } from '../FinancialCommentPopover';
import type { FinancialComment, AddCommentParams } from '@/hooks/useFinancialComments';

export type WidgetType =
  | 'kpi_card'
  | 'annual_card'
  | 'chart'
  | 'metric_card'
  | 'commentary'
  | 'warnings'
  | 'financial_quality'
  | 'checklist'
  | 'balance_sheet'
  | 'summary_field'
  | 'saas_metric'
  | 'kpi_grid';

interface CommentableWidgetProps {
  /** Human-readable label shown in the comment popover */
  targetLabel: string;
  /** Stable machine key for the anchor (e.g. 'recurring_revenue_ttm', 'chart_revenue_breakdown') */
  anchorKey: string;
  /** Which statement this belongs to */
  statementType: 'income_statement' | 'balance_sheet';
  /** Widget classification */
  widgetType: WidgetType;
  /** Line item key for grouping */
  lineItemKey: string;
  /** Existing comments for this anchor */
  existingComments: FinancialComment[];
  /** Callback to add a comment */
  onAdd: (params: AddCommentParams) => Promise<FinancialComment | null>;
  /** Callback to delete a comment */
  onDelete: (id: string) => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

export function CommentableWidget({
  targetLabel,
  anchorKey,
  statementType,
  widgetType,
  lineItemKey,
  existingComments,
  onAdd,
  onDelete,
  children,
  className,
}: CommentableWidgetProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const commentCount = existingComments.length;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={`relative group/commentable ${className || ''}`}>
          {children}
          {/* Comment indicator badge */}
          {commentCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPopoverOpen(true);
              }}
              className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-colors"
            >
              <MessageSquare className="h-2.5 w-2.5" />
              {commentCount}
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onClick={() => setPopoverOpen(true)}
          className="gap-2 text-xs"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Add comment on {targetLabel.length > 28 ? targetLabel.slice(0, 28) + '…' : targetLabel}
        </ContextMenuItem>
      </ContextMenuContent>

      {/* Popover rendered separately, triggered by state */}
      <FinancialCommentPopover
        anchorKey={anchorKey}
        targetLabel={targetLabel}
        statementType={statementType}
        lineItemKey={lineItemKey}
        lineItemLabel={targetLabel}
        anchorType="widget"
        existingComments={existingComments}
        onAdd={onAdd}
        onDelete={onDelete}
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
      >
        <span />
      </FinancialCommentPopover>
    </ContextMenu>
  );
}
