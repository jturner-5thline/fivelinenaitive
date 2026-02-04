import { useState, useMemo } from 'react';
import { Check, FileText, X, File, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChecklistItem {
  id: string;
  name: string;
  category: string | null;
  is_required: boolean;
}

interface ChecklistLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistItems: ChecklistItem[];
  files: File[];
  category: string;
  onConfirm: (assignments: Map<number, string | null>) => void;
  onCancel: () => void;
}

// Map upload folder categories to checklist category keywords
const CATEGORY_MAPPINGS: Record<string, string[]> = {
  materials: ['materials', 'material', 'kpi', 'kpis', 'metrics', 'data'],
  financials: ['financials', 'financial', 'finance', 'accounting', 'revenue', 'budget'],
  agreements: ['agreements', 'agreement', 'legal', 'contract', 'contracts', 'compliance'],
  other: ['other', 'miscellaneous', 'general'],
};

// Draggable file card component
function DraggableFileCard({ file, index, isAssigned }: { file: File; index: number; isAssigned: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${index}`,
    data: { file, index },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50",
        isAssigned 
          ? "border-primary/50 bg-primary/5" 
          : "border-border bg-card hover:border-muted-foreground/50"
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate flex-1">{file.name}</span>
      {isAssigned && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
    </div>
  );
}

// File card for drag overlay
function FileCardOverlay({ file }: { file: File }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-primary bg-card shadow-lg">
      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <File className="h-4 w-4 text-primary flex-shrink-0" />
      <span className="text-sm truncate">{file.name}</span>
    </div>
  );
}

// Droppable checklist item component
function DroppableChecklistItem({ 
  item, 
  assignedFiles,
  onRemoveFile,
}: { 
  item: ChecklistItem; 
  assignedFiles: { file: File; index: number }[];
  onRemoveFile: (fileIndex: number) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `checklist-${item.id}`,
    data: { checklistItemId: item.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-3 rounded-lg border-2 border-dashed transition-all min-h-[60px]",
        isOver 
          ? "border-primary bg-primary/10" 
          : assignedFiles.length > 0
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-muted-foreground/50"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Check className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="font-medium text-sm">{item.name}</span>
        {item.is_required && (
          <span className="text-xs text-destructive">*</span>
        )}
      </div>
      
      {assignedFiles.length > 0 ? (
        <div className="space-y-1">
          {assignedFiles.map(({ file, index }) => (
            <div 
              key={index}
              className="flex items-center gap-2 p-1.5 rounded bg-background text-xs"
            >
              <File className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <button
                onClick={() => onRemoveFile(index)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isOver ? "Drop file here" : "Drag file here to assign"}
        </p>
      )}
    </div>
  );
}

// Droppable N/A zone
function DroppableNAZone({ 
  assignedFiles,
  onRemoveFile,
}: { 
  assignedFiles: { file: File; index: number }[];
  onRemoveFile: (fileIndex: number) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'checklist-na',
    data: { checklistItemId: null },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-3 rounded-lg border-2 border-dashed transition-all min-h-[60px]",
        isOver 
          ? "border-muted-foreground bg-muted/50" 
          : assignedFiles.length > 0
            ? "border-muted-foreground/50 bg-muted/30"
            : "border-border hover:border-muted-foreground/50"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <X className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="font-medium text-sm">N/A - No checklist link</span>
      </div>
      
      {assignedFiles.length > 0 ? (
        <div className="space-y-1">
          {assignedFiles.map(({ file, index }) => (
            <div 
              key={index}
              className="flex items-center gap-2 p-1.5 rounded bg-background text-xs"
            >
              <File className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <button
                onClick={() => onRemoveFile(index)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isOver ? "Drop file here" : "Files uploaded without linking"}
        </p>
      )}
    </div>
  );
}

export function ChecklistLinkDialog({
  open,
  onOpenChange,
  checklistItems,
  files,
  category,
  onConfirm,
  onCancel,
}: ChecklistLinkDialogProps) {
  // Track file assignments: fileIndex -> checklistItemId (null = N/A, undefined = unassigned)
  const [assignments, setAssignments] = useState<Map<number, string | null>>(new Map());
  const [activeFile, setActiveFile] = useState<{ file: File; index: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Filter checklist items based on the upload category
  const filteredItems = useMemo(() => {
    const keywords = CATEGORY_MAPPINGS[category.toLowerCase()] || [];
    
    if (keywords.length === 0) return checklistItems;
    
    return checklistItems.filter(item => {
      if (!item.category) return false;
      const itemCategoryLower = item.category.toLowerCase();
      return keywords.some(keyword => itemCategoryLower.includes(keyword));
    });
  }, [checklistItems, category]);

  // Group filtered items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  // Get files assigned to a specific checklist item
  const getAssignedFiles = (checklistItemId: string | null) => {
    return files
      .map((file, index) => ({ file, index }))
      .filter(({ index }) => {
        const assignment = assignments.get(index);
        if (checklistItemId === null) {
          return assignment === null; // Explicitly assigned to N/A
        }
        return assignment === checklistItemId;
      });
  };

  // Get unassigned files
  const unassignedFiles = files
    .map((file, index) => ({ file, index }))
    .filter(({ index }) => !assignments.has(index));

  const handleDragStart = (event: DragStartEvent) => {
    const { file, index } = event.active.data.current as { file: File; index: number };
    setActiveFile({ file, index });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveFile(null);
    
    const { active, over } = event;
    if (!over) return;

    const fileIndex = (active.data.current as { index: number }).index;
    const dropData = over.data.current as { checklistItemId: string | null } | undefined;
    
    if (dropData !== undefined) {
      setAssignments(prev => {
        const next = new Map(prev);
        next.set(fileIndex, dropData.checklistItemId);
        return next;
      });
    }
  };

  const handleRemoveAssignment = (fileIndex: number) => {
    setAssignments(prev => {
      const next = new Map(prev);
      next.delete(fileIndex);
      return next;
    });
  };

  const handleConfirm = () => {
    // For any unassigned files, treat them as N/A
    const finalAssignments = new Map(assignments);
    files.forEach((_, index) => {
      if (!finalAssignments.has(index)) {
        finalAssignments.set(index, null);
      }
    });
    onConfirm(finalAssignments);
    setAssignments(new Map());
  };

  const handleCancel = () => {
    setAssignments(new Map());
    onCancel();
  };

  const allFilesAssigned = files.every((_, index) => assignments.has(index));

  // For single file, use simpler interface
  if (files.length === 1) {
    return (
      <SingleFileDialog
        open={open}
        onOpenChange={onOpenChange}
        checklistItems={filteredItems}
        file={files[0]}
        category={category}
        categoryLabel={categoryLabel}
        groupedItems={groupedItems}
        onConfirm={(itemId) => {
          const map = new Map<number, string | null>();
          map.set(0, itemId);
          onConfirm(map);
        }}
        onCancel={onCancel}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Assign Files to Checklist Items
          </DialogTitle>
          <DialogDescription>
            Drag each file to the appropriate checklist item, or to N/A if no link applies.
          </DialogDescription>
        </DialogHeader>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-hidden grid grid-cols-2 gap-4">
            {/* Left: Files to assign */}
            <div className="flex flex-col min-h-0">
              <div className="text-sm font-medium mb-2 text-muted-foreground">
                Files ({unassignedFiles.length} remaining)
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {unassignedFiles.map(({ file, index }) => (
                    <DraggableFileCard
                      key={index}
                      file={file}
                      index={index}
                      isAssigned={false}
                    />
                  ))}
                  {unassignedFiles.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      All files assigned!
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Checklist items as drop zones */}
            <div className="flex flex-col min-h-0">
              <div className="text-sm font-medium mb-2 text-muted-foreground">
                {categoryLabel} Checklist Items
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {/* N/A zone at top */}
                  <DroppableNAZone
                    assignedFiles={getAssignedFiles(null)}
                    onRemoveFile={handleRemoveAssignment}
                  />

                  {/* Grouped checklist items */}
                  {Object.entries(groupedItems).map(([categoryName, items]) => (
                    <div key={categoryName} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2">
                        {categoryName}
                      </div>
                      {items.map((item) => (
                        <DroppableChecklistItem
                          key={item.id}
                          item={item}
                          assignedFiles={getAssignedFiles(item.id)}
                          onRemoveFile={handleRemoveAssignment}
                        />
                      ))}
                    </div>
                  ))}

                  {filteredItems.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">No matching checklist items for {categoryLabel}</p>
                      <p className="text-xs mt-1">All files will be uploaded without linking</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DragOverlay>
            {activeFile && <FileCardOverlay file={activeFile.file} />}
          </DragOverlay>
        </DndContext>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            {allFilesAssigned 
              ? `Upload ${files.length} Files` 
              : `Upload ${files.length} Files (${unassignedFiles.length} unlinked)`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simpler dialog for single file uploads (keeps original radio button UX)
function SingleFileDialog({
  open,
  onOpenChange,
  checklistItems,
  file,
  category,
  categoryLabel,
  groupedItems,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistItems: ChecklistItem[];
  file: File;
  category: string;
  categoryLabel: string;
  groupedItems: Record<string, ChecklistItem[]>;
  onConfirm: (selectedItemId: string | null) => void;
  onCancel: () => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const handleConfirm = () => {
    onConfirm(selectedItemId === 'na' ? null : selectedItemId);
    setSelectedItemId(null);
  };

  const handleCancel = () => {
    setSelectedItemId(null);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Link to Checklist Item
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <div>
              You're uploading to <span className="font-medium">{categoryLabel}</span>.
              Select which checklist item this supports, or choose N/A if none apply.
            </div>
            <div className="bg-muted/50 rounded-md p-2 text-xs">
              <div className="font-medium text-foreground mb-1">File:</div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <File className="h-3 w-3" />
                <span className="truncate">{file.name}</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="space-y-2">
            {/* N/A Option at the top */}
            <div
              className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                selectedItemId === 'na'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
              onClick={() => setSelectedItemId('na')}
            >
              <div className={cn(
                "h-4 w-4 rounded-full border flex items-center justify-center",
                selectedItemId === 'na' ? "border-primary" : "border-muted-foreground"
              )}>
                {selectedItemId === 'na' && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">N/A - Not applicable</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This file doesn't match any checklist item
                </p>
              </div>
            </div>

            {/* Grouped checklist items */}
            {Object.entries(groupedItems).map(([categoryName, items]) => (
              <div key={categoryName} className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2">
                  {categoryName}
                </div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedItemId === item.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded-full border flex items-center justify-center",
                      selectedItemId === item.id ? "border-primary" : "border-muted-foreground"
                    )}>
                      {selectedItemId === item.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="font-medium">{item.name}</span>
                        {item.is_required && (
                          <span className="text-xs text-destructive">*</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {checklistItems.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No matching checklist items for {categoryLabel}</p>
                <p className="text-xs mt-1">Select N/A to upload without linking</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedItemId}>
            {selectedItemId === 'na' ? 'Upload Without Linking' : 'Upload & Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
