import { forwardRef, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GridWidgetCardProps {
  isEditMode: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A card wrapper for react-grid-layout items.
 * The title area has `.widget-drag-handle` for dragging.
 */
export const GridWidgetCard = forwardRef<HTMLDivElement, GridWidgetCardProps>(
  ({ isEditMode, onEdit, onDelete, children, className, style, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          'h-full',
          isEditMode && 'ring-1 ring-dashed ring-muted-foreground/30 rounded-xl',
          className
        )}
        {...rest}
      >
        <Card className="glass-module h-full flex flex-col overflow-hidden relative group">
          {/* Drag handle bar */}
          {isEditMode && (
            <div className="widget-drag-handle absolute top-0 left-0 right-0 h-8 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1 text-muted-foreground/60">
                <GripVertical className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Drag</span>
                <GripVertical className="h-3.5 w-3.5" />
              </div>
            </div>
          )}

          {/* Edit/Delete buttons */}
          <div className="absolute top-1.5 right-1.5 z-20 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {isEditMode && onDelete && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Widget content */}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </Card>
      </div>
    );
  }
);

GridWidgetCard.displayName = 'GridWidgetCard';
