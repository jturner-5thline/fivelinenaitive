import { useDroppable } from '@dnd-kit/core';
import { format, setHours, setMinutes } from 'date-fns';

interface DroppableTimeSlotProps {
  date: Date;
  hour: number;
  children?: React.ReactNode;
}

export function DroppableTimeSlot({ date, hour, children }: DroppableTimeSlotProps) {
  const slotDate = setMinutes(setHours(date, hour), 0);
  const slotId = `${format(date, 'yyyy-MM-dd')}-${hour}`;

  const { isOver, setNodeRef } = useDroppable({
    id: slotId,
    data: { date: slotDate, hour },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60px] border-b border-border/50 p-1 transition-colors ${
        isOver ? 'bg-primary/10 ring-1 ring-primary ring-inset' : 'hover:bg-accent/30'
      }`}
    >
      {children}
    </div>
  );
}
