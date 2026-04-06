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
  targetLabel: string;
  anchorKey: string;
  statementType: 'income_statement' | 'balance_sheet';
  widgetType: WidgetType;
  lineItemKey: string;
  existingComments: FinancialComment[];
  onAdd: (params: AddCommentParams) => Promise<FinancialComment | null>;
  onDelete: (id: string) => Promise<void>;
  children: React.ReactNode;
}

/**
 * Layout-invisible commenting wrapper.
 * Uses `display: contents` so the wrapper div does not participate
 * in layout — the child renders as if unwrapped in the parent grid/flex.
 */
export function CommentableWidget({
  targetLabel,
  anchorKey,
  statementType,
  lineItemKey,
  existingComments,
  onAdd,
  onDelete,
  children,
}: CommentableWidgetProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div style={{ display: 'contents' }}>
          {children}
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
        {existingComments.length > 0 && (
          <ContextMenuItem
            onClick={() => setPopoverOpen(true)}
            className="gap-2 text-xs"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            View {existingComments.length} comment{existingComments.length !== 1 ? 's' : ''}
          </ContextMenuItem>
        )}
      </ContextMenuContent>

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
