import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableDashboardCardProps {
  /** Card title used as identifier when editing */
  cardTitle: string;
  isEditMode?: boolean;
  onEdit?: (cardTitle: string) => void;
  children: ReactNode;
  className?: string;
}

/**
 * A wrapper around Card that makes it clickable to open the widget editor.
 * In edit mode, shows an edit overlay on hover.
 * Outside edit mode, the whole card is clickable.
 */
export function EditableDashboardCard({
  cardTitle,
  isEditMode = false,
  onEdit,
  children,
  className,
}: EditableDashboardCardProps) {
  const handleClick = () => {
    if (onEdit) {
      onEdit(cardTitle);
    }
  };

  return (
    <Card
      className={cn(
        'group relative transition-all duration-200',
        onEdit && 'cursor-pointer hover:ring-1 hover:ring-primary/40',
        isEditMode && 'ring-1 ring-dashed ring-muted-foreground/30',
        className
      )}
      onClick={handleClick}
    >
      {/* Edit overlay in edit mode */}
      {isEditMode && onEdit && (
        <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(cardTitle);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
      {children}
    </Card>
  );
}
