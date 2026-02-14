import { Folder, FileText, DollarSign, FileCheck, Briefcase, ClipboardList, Archive, Files } from 'lucide-react';
import { CategoryIcon, CATEGORY_ICONS } from '@/hooks/useChecklistCategories';
import { cn } from '@/lib/utils';

interface CategoryIconPickerProps {
  value: CategoryIcon;
  onChange: (icon: CategoryIcon) => void;
}

const iconComponents: Record<CategoryIcon, React.ComponentType<{ className?: string }>> = {
  'folder': Folder,
  'file-text': FileText,
  'dollar-sign': DollarSign,
  'file-check': FileCheck,
  'briefcase': Briefcase,
  'clipboard': ClipboardList,
  'archive': Archive,
  'files': Files,
};

export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CATEGORY_ICONS.map((iconOption) => {
        const IconComponent = iconComponents[iconOption.value];
        const isSelected = value === iconOption.value;
        
        return (
          <button
            key={iconOption.value}
            type="button"
            onClick={() => onChange(iconOption.value)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all overflow-hidden",
              isSelected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            )}
          >
            <IconComponent className="h-4 w-4 shrink-0" />
            <span className="text-[10px] leading-tight truncate w-full text-center">{iconOption.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function getCategoryIcon(icon: CategoryIcon | string): React.ComponentType<{ className?: string }> {
  return iconComponents[icon as CategoryIcon] || Folder;
}
