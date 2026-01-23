import { useMemo } from 'react';
import { Check, Plus, FileText, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChecklistItem } from '@/hooks/useDataRoomChecklist';
import { getCategoryColorClasses } from '@/hooks/useChecklistCategories';
import { getCategoryIcon } from '@/components/settings/CategoryIconPicker';
import { cn } from '@/lib/utils';

interface CategoryConfig {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface DataRoomGridViewProps {
  categories: string[];
  groupedItems: Record<string, ChecklistItem[]>;
  statusMap: Map<string, { isComplete: boolean; attachmentId: string | null }>;
  getCategoryByName: (name: string) => CategoryConfig | undefined;
  attachments: { id: string; name: string; category: string }[];
  onToggle: (itemId: string, currentStatus: boolean) => void;
  onLinkAttachment?: (checklistItemId: string) => void;
  onUnlink: (itemId: string) => void;
  bulkMode: boolean;
  selectedItems: Set<string>;
  onToggleItemSelection: (itemId: string) => void;
}

export function DataRoomGridView({
  categories,
  groupedItems,
  statusMap,
  getCategoryByName,
  attachments,
  onToggle,
  onLinkAttachment,
  onUnlink,
  bulkMode,
  selectedItems,
  onToggleItemSelection,
}: DataRoomGridViewProps) {
  const getLinkedAttachment = (attachmentId: string | null) => {
    if (!attachmentId) return null;
    return attachments.find(a => a.id === attachmentId);
  };

  return (
    <ScrollArea className="max-h-[500px]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-2">
        {categories.map(category => {
          const categoryItems = groupedItems[category];
          const categoryCompleted = categoryItems.filter(i => statusMap.get(i.id)?.isComplete).length;
          const categoryData = getCategoryByName(category);
          const colorClasses = categoryData ? getCategoryColorClasses(categoryData.color) : getCategoryColorClasses('gray');
          const IconComponent = categoryData ? getCategoryIcon(categoryData.icon) : getCategoryIcon('folder');
          
          const categoryPercent = categoryItems.length > 0 
            ? Math.round((categoryCompleted / categoryItems.length) * 100) 
            : 0;

          return (
            <Card key={category} className="overflow-hidden">
              <CardHeader className={cn("py-3 px-4", colorClasses.bgClass)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <IconComponent className={cn("h-4 w-4", colorClasses.textClass)} />
                    <span className={colorClasses.textClass}>{category}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-xs", colorClasses.textClass)}>
                      {categoryCompleted}/{categoryItems.length}
                    </Badge>
                    <span className={cn(
                      "text-xs font-semibold",
                      categoryPercent === 100 ? "text-green-600" : colorClasses.textClass
                    )}>
                      {categoryPercent}%
                    </span>
                  </div>
                </div>
                <Progress 
                  value={categoryPercent} 
                  className={cn("h-1.5 mt-2", categoryPercent === 100 && "[&>div]:bg-green-500")}
                />
              </CardHeader>
              <CardContent className="p-2">
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {categoryItems.map(item => {
                    const status = statusMap.get(item.id);
                    const isComplete = status?.isComplete ?? false;
                    const linkedAttachment = getLinkedAttachment(status?.attachmentId ?? null);
                    const isSelected = selectedItems.has(item.id);

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md transition-colors text-sm",
                          isComplete 
                            ? "bg-green-500/5" 
                            : "hover:bg-muted/50",
                          bulkMode && isSelected && "ring-1 ring-primary bg-primary/5"
                        )}
                      >
                        {bulkMode ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggleItemSelection(item.id)}
                            className="h-4 w-4"
                          />
                        ) : (
                          <Checkbox
                            checked={isComplete}
                            onCheckedChange={() => onToggle(item.id, isComplete)}
                            className="h-4 w-4"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "truncate text-xs",
                              isComplete && "text-muted-foreground line-through"
                            )}>
                              {item.name}
                            </span>
                            {item.is_required && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Req</Badge>
                            )}
                            {isComplete && !bulkMode && (
                              <Check className="h-3 w-3 text-green-500 shrink-0" />
                            )}
                          </div>
                          {linkedAttachment && (
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="gap-0.5 text-[10px] px-1 py-0 h-4">
                                <Link2 className="h-2.5 w-2.5" />
                                <span className="truncate max-w-[80px]">{linkedAttachment.name}</span>
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4"
                                onClick={() => onUnlink(item.id)}
                              >
                                <Unlink className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {!bulkMode && onLinkAttachment && !linkedAttachment && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => onLinkAttachment(item.id)}
                              >
                                <Link2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Link attachment</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
