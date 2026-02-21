import { useMemo } from 'react';
import { format, subDays, startOfWeek, addDays, getDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HeatmapCalendarProps {
  data: Record<string, number>; // date string -> count
  days?: number;
  height?: number;
}

export function HeatmapCalendar({ data, days = 365, height = 160 }: HeatmapCalendarProps) {
  const cells = useMemo(() => {
    const now = new Date();
    const values = Object.values(data);
    const maxVal = Math.max(...values, 1);
    const cells: { date: Date; count: number; level: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(now, i);
      const key = format(date, 'yyyy-MM-dd');
      const count = data[key] || 0;
      const level = count === 0 ? 0 : Math.min(Math.ceil((count / maxVal) * 4), 4);
      cells.push({ date, count, level });
    }
    return cells;
  }, [data, days]);

  const weeks = useMemo(() => {
    const result: typeof cells[] = [];
    let currentWeek: typeof cells = [];
    
    // Pad the first week
    if (cells.length > 0) {
      const firstDay = getDay(cells[0].date);
      for (let i = 0; i < firstDay; i++) {
        currentWeek.push({ date: new Date(0), count: -1, level: -1 });
      }
    }

    cells.forEach((cell) => {
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(cell);
    });
    if (currentWeek.length > 0) result.push(currentWeek);
    return result;
  }, [cells]);

  const levelColors = [
    'bg-muted',
    'bg-primary/20',
    'bg-primary/40',
    'bg-primary/60',
    'bg-primary/90',
  ];

  return (
    <TooltipProvider>
      <div className="overflow-x-auto" style={{ maxHeight: height }}>
        <div className="flex gap-[2px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map((cell, di) => (
                cell.count === -1 ? (
                  <div key={di} className="w-[10px] h-[10px]" />
                ) : (
                  <Tooltip key={di}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-[10px] h-[10px] rounded-[2px] ${levelColors[cell.level]} transition-colors`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{format(cell.date, 'MMM d, yyyy')}</p>
                      <p>{cell.count} {cell.count === 1 ? 'activity' : 'activities'}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>Less</span>
          {levelColors.map((c, i) => (
            <div key={i} className={`w-[10px] h-[10px] rounded-[2px] ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
