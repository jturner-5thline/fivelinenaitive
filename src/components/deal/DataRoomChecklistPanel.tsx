import { useMemo } from 'react';
import { Check, Circle, FileCheck, Link2, Unlink, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useDataRoomChecklist, useDealChecklistStatus, ChecklistItem } from '@/hooks/useDataRoomChecklist';
import { cn } from '@/lib/utils';

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  indicatorClassName?: string;
}

function CircularProgress({ 
  value, 
  size = 48, 
  strokeWidth = 4,
  className,
  indicatorClassName
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("text-primary transition-all duration-300", indicatorClassName)}
        />
      </svg>
      <span className="absolute text-xs font-semibold">{value}%</span>
    </div>
  );
}

interface DataRoomChecklistPanelProps {
  dealId: string;
  attachments?: { id: string; name: string; category: string }[];
  onLinkAttachment?: (checklistItemId: string) => void;
}

export function DataRoomChecklistPanel({ 
  dealId, 
  attachments = [],
  onLinkAttachment 
}: DataRoomChecklistPanelProps) {
  const { items: checklistItems, loading: loadingItems } = useDataRoomChecklist();
  const { statuses, toggleItemStatus, unlinkAttachment } = useDealChecklistStatus(dealId);

  const statusMap = useMemo(() => {
    const map = new Map<string, { isComplete: boolean; attachmentId: string | null }>();
    statuses.forEach(s => {
      map.set(s.checklist_item_id, { 
        isComplete: s.is_complete, 
        attachmentId: s.attachment_id 
      });
    });
    return map;
  }, [statuses]);

  const completedCount = checklistItems.filter(item => 
    statusMap.get(item.id)?.isComplete
  ).length;

  const requiredItems = checklistItems.filter(i => i.is_required);
  const completedRequiredCount = requiredItems.filter(item => 
    statusMap.get(item.id)?.isComplete
  ).length;

  const progressPercent = checklistItems.length > 0 
    ? Math.round((completedCount / checklistItems.length) * 100) 
    : 0;

  const requiredProgressPercent = requiredItems.length > 0
    ? Math.round((completedRequiredCount / requiredItems.length) * 100)
    : 100;

  // Group items by category
  const groupedItems = useMemo(() => {
    return checklistItems.reduce((acc, item) => {
      const category = item.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {} as Record<string, ChecklistItem[]>);
  }, [checklistItems]);

  const categories = Object.keys(groupedItems).sort((a, b) => 
    a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)
  );

  const getLinkedAttachment = (attachmentId: string | null) => {
    if (!attachmentId) return null;
    return attachments.find(a => a.id === attachmentId);
  };

  const handleToggle = async (itemId: string, currentStatus: boolean) => {
    await toggleItemStatus(itemId, !currentStatus);
  };

  const handleUnlink = async (itemId: string) => {
    await unlinkAttachment(itemId);
  };

  if (loadingItems) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading checklist...
      </div>
    );
  }

  if (checklistItems.length === 0) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg">
        <FileCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">No checklist configured</p>
        <p className="text-sm text-muted-foreground mt-1">
          Set up your data room checklist in Settings → Data Room Checklist
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress Summary */}
      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-4">
          <CircularProgress 
            value={progressPercent} 
            size={56} 
            strokeWidth={5}
            indicatorClassName={progressPercent === 100 ? "text-green-500" : undefined}
          />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Data Room Progress</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {checklistItems.length} items complete
            </p>
            {requiredItems.length > 0 && requiredItems.length !== checklistItems.length && (
              <p className="text-xs text-muted-foreground">
                Required: {completedRequiredCount}/{requiredItems.length}
                {requiredProgressPercent < 100 && (
                  <span className="text-amber-500 ml-1">({requiredProgressPercent}%)</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Checklist Items */}
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-4 pr-2">
          {categories.map(category => {
            const categoryItems = groupedItems[category];
            const categoryCompleted = categoryItems.filter(i => statusMap.get(i.id)?.isComplete).length;
            
            return (
              <Collapsible key={category} defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:bg-muted/50 p-2 rounded-lg transition-colors">
                  <span className="text-sm font-semibold text-muted-foreground">{category}</span>
                  <Badge variant="outline" className="text-xs">
                    {categoryCompleted}/{categoryItems.length}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 mt-1">
                  {categoryItems.map(item => {
                    const status = statusMap.get(item.id);
                    const isComplete = status?.isComplete ?? false;
                    const linkedAttachment = getLinkedAttachment(status?.attachmentId ?? null);

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          isComplete 
                            ? "bg-green-500/5 border-green-500/20" 
                            : "bg-card hover:bg-muted/30"
                        )}
                      >
                        <Checkbox
                          checked={isComplete}
                          onCheckedChange={() => handleToggle(item.id, isComplete)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-medium text-sm",
                              isComplete && "text-muted-foreground line-through"
                            )}>
                              {item.name}
                            </span>
                            {item.is_required && (
                              <Badge variant="secondary" className="text-xs">Required</Badge>
                            )}
                          </div>
                          {item.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-xs text-muted-foreground truncate cursor-help mt-0.5">
                                  {item.description}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                {item.description}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {linkedAttachment && (
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Link2 className="h-3 w-3" />
                                {linkedAttachment.name}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => handleUnlink(item.id)}
                              >
                                <Unlink className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {onLinkAttachment && !linkedAttachment && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => onLinkAttachment(item.id)}
                              >
                                <Link2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Link attachment</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
