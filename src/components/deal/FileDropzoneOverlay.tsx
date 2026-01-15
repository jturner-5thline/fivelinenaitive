import { Upload, FileText, DollarSign, FileCheck, Folder } from 'lucide-react';
import { DEAL_ATTACHMENT_CATEGORIES, DealAttachmentCategory } from '@/hooks/useDealAttachments';
import { cn } from '@/lib/utils';

interface FileDropzoneOverlayProps {
  onDropToCategory: (category: DealAttachmentCategory, files: File[]) => void;
  onDragEnd: () => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  materials: <Folder className="h-6 w-6" />,
  financials: <DollarSign className="h-6 w-6" />,
  agreements: <FileCheck className="h-6 w-6" />,
  other: <FileText className="h-6 w-6" />,
};

const categoryColors: Record<string, string> = {
  materials: 'border-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40',
  financials: 'border-green-400 bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-900/40',
  agreements: 'border-orange-400 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/40',
  other: 'border-gray-400 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/40',
};

const categoryActiveColors: Record<string, string> = {
  materials: 'border-blue-500 bg-blue-100 ring-2 ring-blue-400 dark:bg-blue-900/50',
  financials: 'border-green-500 bg-green-100 ring-2 ring-green-400 dark:bg-green-900/50',
  agreements: 'border-orange-500 bg-orange-100 ring-2 ring-orange-400 dark:bg-orange-900/50',
  other: 'border-gray-500 bg-gray-100 ring-2 ring-gray-400 dark:bg-gray-700/50',
};

const categoryIconColors: Record<string, string> = {
  materials: 'text-blue-500',
  financials: 'text-green-500',
  agreements: 'text-orange-500',
  other: 'text-gray-500',
};

export function FileDropzoneOverlay({ onDropToCategory, onDragEnd }: FileDropzoneOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <Upload className="h-6 w-6 text-primary animate-bounce" />
        <h3 className="text-lg font-semibold text-foreground">Drop files into a folder</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {DEAL_ATTACHMENT_CATEGORIES.map((category) => (
          <CategoryDropZone
            key={category.value}
            category={category}
            onDrop={(files) => onDropToCategory(category.value as DealAttachmentCategory, files)}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
      
      <p className="text-xs text-muted-foreground mt-4">
        Drag away or press Escape to cancel
      </p>
    </div>
  );
}

interface CategoryDropZoneProps {
  category: { value: string; label: string };
  onDrop: (files: File[]) => void;
  onDragEnd: () => void;
}

function CategoryDropZone({ category, onDrop, onDragEnd }: CategoryDropZoneProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('scale-105');
    e.currentTarget.classList.remove(categoryColors[category.value]);
    e.currentTarget.classList.add(...categoryActiveColors[category.value].split(' '));
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('scale-105');
    e.currentTarget.classList.remove(...categoryActiveColors[category.value].split(' '));
    e.currentTarget.classList.add(categoryColors[category.value]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onDrop(files);
    }
    onDragEnd();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200",
        categoryColors[category.value]
      )}
    >
      <div className={cn("mb-2", categoryIconColors[category.value])}>
        {categoryIcons[category.value]}
      </div>
      <span className="text-sm font-medium text-foreground">{category.label}</span>
    </div>
  );
}
