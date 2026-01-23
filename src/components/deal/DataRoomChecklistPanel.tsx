import { useMemo, useState } from 'react';
import { Check, Circle, FileCheck, Link2, Unlink, ExternalLink, Info, ChevronDown, Filter, X, CheckCheck, Square, List, LayoutGrid } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDataRoomChecklist, useDealChecklistStatus, ChecklistItem } from '@/hooks/useDataRoomChecklist';
import { useChecklistCategories, getCategoryColorClasses } from '@/hooks/useChecklistCategories';
import { getCategoryIcon } from '@/components/settings/CategoryIconPicker';
import { DataRoomGridView } from './DataRoomGridView';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ViewMode = 'list' | 'grid';

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
  const { categories: categoryConfigs, getCategoryByName } = useChecklistCategories();
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  
  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

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

  // Get all unique categories from items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    checklistItems.forEach(item => {
      cats.add(item.category || 'Other');
    });
    return Array.from(cats).sort((a, b) => 
      a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)
    );
  }, [checklistItems]);

  // Filter items by selected categories and completion status
  const filteredItems = useMemo(() => {
    let items = checklistItems;
    
    // Filter by categories
    if (selectedCategories.length > 0) {
      items = items.filter(item => 
        selectedCategories.includes(item.category || 'Other')
      );
    }
    
    // Filter by completion status
    if (showIncompleteOnly) {
      items = items.filter(item => !statusMap.get(item.id)?.isComplete);
    }
    
    return items;
  }, [checklistItems, selectedCategories, showIncompleteOnly, statusMap]);

  const completedCount = checklistItems.filter(item => 
    statusMap.get(item.id)?.isComplete
  ).length;

  const incompleteCount = checklistItems.length - completedCount;

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

  // Group filtered items by category
  const groupedItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const category = item.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {} as Record<string, ChecklistItem[]>);
  }, [filteredItems]);

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

  const toggleCategoryFilter = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setShowIncompleteOnly(false);
  };

  // Bulk selection handlers
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const incompleteVisibleItems = filteredItems.filter(item => !statusMap.get(item.id)?.isComplete);
    setSelectedItems(new Set(incompleteVisibleItems.map(i => i.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleBulkComplete = async () => {
    if (selectedItems.size === 0) return;
    
    const itemsToComplete = Array.from(selectedItems);
    let successCount = 0;
    
    for (const itemId of itemsToComplete) {
      const success = await toggleItemStatus(itemId, true);
      if (success) successCount++;
    }
    
    toast.success(`Marked ${successCount} items as complete`);
    setSelectedItems(new Set());
    setBulkMode(false);
  };

  const handleBulkIncomplete = async () => {
    if (selectedItems.size === 0) return;
    
    const itemsToMark = Array.from(selectedItems);
    let successCount = 0;
    
    for (const itemId of itemsToMark) {
      const success = await toggleItemStatus(itemId, false);
      if (success) successCount++;
    }
    
    toast.success(`Marked ${successCount} items as incomplete`);
    setSelectedItems(new Set());
    setBulkMode(false);
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedItems(new Set());
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

      {/* Filters and Bulk Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-3.5 w-3.5" />
              Filter
              {selectedCategories.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {selectedCategories.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-popover border shadow-lg z-50">
            <DropdownMenuLabel>Categories</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableCategories.map(category => {
              const categoryData = getCategoryByName(category);
              const colorClasses = categoryData ? getCategoryColorClasses(categoryData.color) : getCategoryColorClasses('gray');
              const IconComponent = categoryData ? getCategoryIcon(categoryData.icon) : getCategoryIcon('folder');
              
              return (
                <DropdownMenuCheckboxItem
                  key={category}
                  checked={selectedCategories.includes(category)}
                  onCheckedChange={() => toggleCategoryFilter(category)}
                >
                  <div className="flex items-center gap-2">
                    <IconComponent className={cn("h-4 w-4", colorClasses.textClass)} />
                    <span>{category}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Incomplete Only Toggle */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-background">
          <Switch
            id="incomplete-only"
            checked={showIncompleteOnly}
            onCheckedChange={setShowIncompleteOnly}
            className="scale-75"
          />
          <Label htmlFor="incomplete-only" className="text-xs cursor-pointer">
            Incomplete only {incompleteCount > 0 && `(${incompleteCount})`}
          </Label>
        </div>

        {/* Clear Filters */}
        {(selectedCategories.length > 0 || showIncompleteOnly) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-8 px-2">
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}

        <div className="flex-1" />

        {/* View Mode Toggle */}
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)} className="border rounded-md">
          <ToggleGroupItem value="list" aria-label="List view" className="h-8 w-8 p-0">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view" className="h-8 w-8 p-0">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Bulk Mode Toggle */}
        {!bulkMode ? (
          <Button variant="outline" size="sm" onClick={() => setBulkMode(true)} className="gap-2">
            <CheckCheck className="h-3.5 w-3.5" />
            Bulk Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAllVisible} className="gap-1">
              <Square className="h-3.5 w-3.5" />
              Select All
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleBulkComplete}
              disabled={selectedItems.size === 0}
              className="gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              Complete ({selectedItems.size})
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleBulkIncomplete}
              disabled={selectedItems.size === 0}
              className="gap-1"
            >
              <Circle className="h-3.5 w-3.5" />
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={exitBulkMode}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Active filter badges */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedCategories.map(category => {
            const categoryData = getCategoryByName(category);
            const colorClasses = categoryData ? getCategoryColorClasses(categoryData.color) : getCategoryColorClasses('gray');
            const IconComponent = categoryData ? getCategoryIcon(categoryData.icon) : getCategoryIcon('folder');
            
            return (
              <Badge 
                key={category} 
                variant="secondary" 
                className={cn("gap-1 cursor-pointer hover:opacity-80", colorClasses.bgClass)}
                onClick={() => toggleCategoryFilter(category)}
              >
                <IconComponent className={cn("h-3 w-3", colorClasses.textClass)} />
                <span className={colorClasses.textClass}>{category}</span>
                <X className={cn("h-3 w-3 ml-0.5", colorClasses.textClass)} />
              </Badge>
            );
          })}
        </div>
      )}

      {/* Empty state for filtered results */}
      {filteredItems.length === 0 && (
        <div className="p-6 text-center border-2 border-dashed rounded-lg">
          <Check className="h-10 w-10 mx-auto text-green-500 mb-3" />
          <p className="font-medium">All items complete!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {showIncompleteOnly ? 'No incomplete items to show' : 'Great job completing all checklist items'}
          </p>
        </div>
      )}

      {/* Checklist Items */}
      {filteredItems.length > 0 && viewMode === 'grid' && (
        <DataRoomGridView
          categories={categories}
          groupedItems={groupedItems}
          statusMap={statusMap}
          getCategoryByName={getCategoryByName}
          attachments={attachments}
          onToggle={handleToggle}
          onLinkAttachment={onLinkAttachment}
          onUnlink={handleUnlink}
          bulkMode={bulkMode}
          selectedItems={selectedItems}
          onToggleItemSelection={toggleItemSelection}
        />
      )}

      {filteredItems.length > 0 && viewMode === 'list' && (
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4 pr-2">
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
                <Collapsible key={category} defaultOpen>
                  <CollapsibleTrigger className="flex flex-col w-full text-left hover:bg-muted/50 p-2 rounded-lg transition-colors group gap-2">
                    <div className="flex items-center justify-between w-full">
                      <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md", colorClasses.bgClass)}>
                        <IconComponent className={cn("h-4 w-4", colorClasses.textClass)} />
                        <span className={cn("text-sm font-semibold", colorClasses.textClass)}>{category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {categoryCompleted}/{categoryItems.length}
                        </span>
                        <span className={cn(
                          "text-xs font-medium",
                          categoryPercent === 100 ? "text-green-600" : "text-muted-foreground"
                        )}>
                          {categoryPercent}%
                        </span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      </div>
                    </div>
                    <Progress 
                      value={categoryPercent} 
                      className={cn("h-1.5 w-full", categoryPercent === 100 && "[&>div]:bg-green-500")}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 mt-1">
                    {categoryItems.map(item => {
                      const status = statusMap.get(item.id);
                      const isComplete = status?.isComplete ?? false;
                      const linkedAttachment = getLinkedAttachment(status?.attachmentId ?? null);
                      const isSelected = selectedItems.has(item.id);

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                            isComplete 
                              ? "bg-green-500/5 border-green-500/20" 
                              : "bg-card hover:bg-muted/30",
                            bulkMode && isSelected && "ring-2 ring-primary"
                          )}
                        >
                          {bulkMode ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleItemSelection(item.id)}
                              className="mt-0.5"
                            />
                          ) : (
                            <Checkbox
                              checked={isComplete}
                              onCheckedChange={() => handleToggle(item.id, isComplete)}
                              className="mt-0.5"
                            />
                          )}
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
                              {isComplete && !bulkMode && (
                                <Check className="h-3.5 w-3.5 text-green-500" />
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
                          {!bulkMode && onLinkAttachment && !linkedAttachment && (
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
      )}
    </div>
  );
}
