import { useState } from 'react';
import { Upload, FileText, DollarSign, FileCheck, Folder, Briefcase, Clipboard, Archive, Files } from 'lucide-react';
import { ChecklistLinkDialog } from './ChecklistLinkDialog';
import { cn } from '@/lib/utils';
import { ChecklistCategory, CategoryColor, CategoryIcon, CATEGORY_COLORS } from '@/hooks/useChecklistCategories';

interface ChecklistItemForLink {
  id: string;
  name: string;
  category: string | null;
  is_required: boolean;
}

interface FileDropzoneOverlayProps {
  onDropToCategory: (category: string, files: File[], assignments: Map<number, string | null>) => void;
  onDragEnd: () => void;
  checklistItems?: ChecklistItemForLink[];
  categories: ChecklistCategory[];
}

// Map icon names to components
const iconComponents: Record<CategoryIcon, React.ReactNode> = {
  'folder': <Folder className="h-6 w-6" />,
  'file-text': <FileText className="h-6 w-6" />,
  'dollar-sign': <DollarSign className="h-6 w-6" />,
  'file-check': <FileCheck className="h-6 w-6" />,
  'briefcase': <Briefcase className="h-6 w-6" />,
  'clipboard': <Clipboard className="h-6 w-6" />,
  'archive': <Archive className="h-6 w-6" />,
  'files': <Files className="h-6 w-6" />,
};

// Generate color classes based on category color
const getColorClasses = (color: CategoryColor) => {
  const colorMap: Record<CategoryColor, { base: string; active: string; icon: string }> = {
    blue: {
      base: 'border-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40',
      active: 'border-blue-500 bg-blue-100 ring-2 ring-blue-400 dark:bg-blue-900/50',
      icon: 'text-blue-500',
    },
    green: {
      base: 'border-green-400 bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-900/40',
      active: 'border-green-500 bg-green-100 ring-2 ring-green-400 dark:bg-green-900/50',
      icon: 'text-green-500',
    },
    purple: {
      base: 'border-purple-400 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/40',
      active: 'border-purple-500 bg-purple-100 ring-2 ring-purple-400 dark:bg-purple-900/50',
      icon: 'text-purple-500',
    },
    amber: {
      base: 'border-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40',
      active: 'border-amber-500 bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-900/50',
      icon: 'text-amber-500',
    },
    pink: {
      base: 'border-pink-400 bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/30 dark:hover:bg-pink-900/40',
      active: 'border-pink-500 bg-pink-100 ring-2 ring-pink-400 dark:bg-pink-900/50',
      icon: 'text-pink-500',
    },
    cyan: {
      base: 'border-cyan-400 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/30 dark:hover:bg-cyan-900/40',
      active: 'border-cyan-500 bg-cyan-100 ring-2 ring-cyan-400 dark:bg-cyan-900/50',
      icon: 'text-cyan-500',
    },
    orange: {
      base: 'border-orange-400 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/40',
      active: 'border-orange-500 bg-orange-100 ring-2 ring-orange-400 dark:bg-orange-900/50',
      icon: 'text-orange-500',
    },
    gray: {
      base: 'border-gray-400 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/40',
      active: 'border-gray-500 bg-gray-100 ring-2 ring-gray-400 dark:bg-gray-700/50',
      icon: 'text-gray-500',
    },
  };
  return colorMap[color] || colorMap.gray;
};

export function FileDropzoneOverlay({ onDropToCategory, onDragEnd, checklistItems = [], categories }: FileDropzoneOverlayProps) {
  const [pendingUpload, setPendingUpload] = useState<{
    category: string;
    files: File[];
  } | null>(null);

  const handleCategoryDrop = (category: string, files: File[]) => {
    // If there are checklist items, show the dialog
    if (checklistItems.length > 0) {
      setPendingUpload({ category, files });
    } else {
      // No checklist items, proceed directly
      onDropToCategory(category, files, new Map());
      onDragEnd();
    }
  };

  const handleDialogConfirm = (assignments: Map<number, string | null>) => {
    if (pendingUpload) {
      onDropToCategory(pendingUpload.category, pendingUpload.files, assignments);
      setPendingUpload(null);
      onDragEnd();
    }
  };

  const handleDialogCancel = () => {
    setPendingUpload(null);
    onDragEnd();
  };

  return (
    <>
      <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="h-6 w-6 text-primary animate-bounce" />
          <h3 className="text-lg font-semibold text-foreground">Drop files into a folder</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
          {categories.map((category) => (
            <CategoryDropZone
              key={category.id}
              category={category}
              onDrop={(files) => handleCategoryDrop(category.name, files)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
        
        <p className="text-xs text-muted-foreground mt-4">
          Drag away or press Escape to cancel
        </p>
      </div>

      {/* Checklist Link Dialog */}
      <ChecklistLinkDialog
        open={!!pendingUpload}
        onOpenChange={(open) => {
          if (!open) handleDialogCancel();
        }}
        checklistItems={checklistItems}
        files={pendingUpload?.files || []}
        category={pendingUpload?.category || categories[0]?.name || 'Materials'}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
      />
    </>
  );
}

interface CategoryDropZoneProps {
  category: ChecklistCategory;
  onDrop: (files: File[]) => void;
  onDragEnd: () => void;
}

function CategoryDropZone({ category, onDrop }: CategoryDropZoneProps) {
  const colors = getColorClasses(category.color as CategoryColor);
  const icon = iconComponents[category.icon as CategoryIcon] || iconComponents['folder'];
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('scale-105');
    // Apply active styles
    colors.base.split(' ').forEach(cls => e.currentTarget.classList.remove(cls));
    colors.active.split(' ').forEach(cls => e.currentTarget.classList.add(cls));
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('scale-105');
    // Remove active styles, add base styles back
    colors.active.split(' ').forEach(cls => e.currentTarget.classList.remove(cls));
    colors.base.split(' ').forEach(cls => e.currentTarget.classList.add(cls));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onDrop(files);
    }
    // Don't call onDragEnd here - let the dialog handle it
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200",
        colors.base
      )}
    >
      <div className={cn("mb-2", colors.icon)}>
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground">{category.name}</span>
    </div>
  );
}
