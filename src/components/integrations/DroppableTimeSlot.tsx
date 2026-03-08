import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, setHours, setMinutes } from 'date-fns';
import { Plus } from 'lucide-react';

interface DroppableTimeSlotProps {
  date: Date;
  hour: number;
  isNoon?: boolean;
  isPM?: boolean;
  children?: React.ReactNode;
}

export function DroppableTimeSlot({ date, hour, isNoon, isPM, children }: DroppableTimeSlotProps) {
  const slotDate = setMinutes(setHours(date, hour), 0);
  const slotId = `${format(date, 'yyyy-MM-dd')}-${hour}`;
  const [isHovered, setIsHovered] = useState(false);

  const { isOver, setNodeRef } = useDroppable({
    id: slotId,
    data: { date: slotDate, hour },
  });

  const hasChildren = children && (children as any)?.props?.children?.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[60px] p-1 transition-colors ${
        isNoon
          ? 'border-b border-[rgba(255,255,255,0.12)]'
          : 'border-b border-[rgba(255,255,255,0.06)]'
      } ${isPM ? 'bg-[rgba(255,255,255,0.02)]' : ''} ${
        isOver ? 'bg-primary/10 ring-1 ring-primary ring-inset' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered && !isOver && !hasChildren && (
        <div className="absolute inset-0 bg-[rgba(255,255,255,0.04)] flex items-center justify-center pointer-events-none">
          <Plus className="h-4 w-4 text-[rgba(255,255,255,0.2)]" />
        </div>
      )}
    </div>
  );
}
