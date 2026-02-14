import { CategoryColor, CATEGORY_COLORS } from '@/hooks/useChecklistCategories';
import { cn } from '@/lib/utils';

interface CategoryColorPickerProps {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}

export function CategoryColorPicker({ value, onChange }: CategoryColorPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CATEGORY_COLORS.map((colorOption) => {
        const isSelected = value === colorOption.value;
        
        return (
          <button
            key={colorOption.value}
            type="button"
            onClick={() => onChange(colorOption.value)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
              colorOption.bgClass,
              isSelected
                ? "ring-2 ring-primary ring-offset-2"
                : "hover:ring-1 hover:ring-border"
            )}
          >
            <div className={cn("w-4 h-4 rounded-full shrink-0", colorOption.textClass, "bg-current")} />
            <span className={cn("text-[10px] font-medium leading-tight", colorOption.textClass)}>{colorOption.label}</span>
          </button>
        );
      })}
    </div>
  );
}
