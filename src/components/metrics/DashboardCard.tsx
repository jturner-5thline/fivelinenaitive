import { forwardRef, ComponentPropsWithoutRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditableDashboard } from '@/contexts/EditableDashboardContext';

/**
 * Drop-in replacement for Card that auto-reads from EditableDashboardContext.
 * Extracts the card title from CardTitle children for the edit callback.
 * If no context is provided, behaves exactly like a normal Card.
 */
export const DashboardCard = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Card> & { 'data-card-title'?: string }>(
  ({ className, children, onClick, 'data-card-title': explicitTitle, ...props }, ref) => {
    const { isEditMode, onCardEdit } = useEditableDashboard();

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      if (onCardEdit && explicitTitle) {
        onCardEdit(explicitTitle);
      }
    };

    const isEditable = !!onCardEdit && !!explicitTitle;

    return (
      <Card
        ref={ref}
        className={cn(
          isEditable && 'cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all group/edit',
          isEditMode && isEditable && 'ring-1 ring-dashed ring-muted-foreground/30',
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {isEditMode && isEditable && (
          <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover/edit:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onCardEdit(explicitTitle!);
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
);

DashboardCard.displayName = 'DashboardCard';
