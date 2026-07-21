import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import { addDays, addMonths } from "date-fns";

export type CalendarPreset = {
  label: string;
  /** Either a Date or a function returning a Date. Passed to the parent via onSelect. */
  date: Date | (() => Date);
};

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /**
   * Optional quick-pick presets rendered inside the calendar dropdown
   * (above the month grid). If omitted and `defaultPresets` is true,
   * a sensible Today / Tomorrow / +1 Week / +1 Month set is used.
   */
  presets?: CalendarPreset[];
  defaultPresets?: boolean;
  /** Called when a preset chip is clicked (in addition to onSelect). */
  onPresetSelect?: (date: Date) => void;
};

const DEFAULT_PRESETS: CalendarPreset[] = [
  { label: "Today", date: () => new Date() },
  { label: "Tomorrow", date: () => addDays(new Date(), 1) },
  { label: "+1 Week", date: () => addDays(new Date(), 7) },
  { label: "+1 Month", date: () => addMonths(new Date(), 1) },
];

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  presets,
  defaultPresets = false,
  onPresetSelect,
  ...props
}: CalendarProps) {
  const resolvedPresets = presets ?? (defaultPresets ? DEFAULT_PRESETS : undefined);

  const handlePreset = (preset: CalendarPreset) => {
    const value = typeof preset.date === "function" ? preset.date() : preset.date;
    onPresetSelect?.(value);
    const selectHandler = (props as { onSelect?: (d: Date) => void }).onSelect;
    // Only single-mode gets the direct forward; range/multiple callers should
    // pass their own onPresetSelect if they want preset behavior.
    const mode = (props as { mode?: string }).mode ?? "single";
    if (mode === "single" && typeof selectHandler === "function") {
      selectHandler(value);
    }
  };

  return (
    <div className={cn("rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-lg overflow-hidden", className?.toString().includes("border-") ? "" : "")}>
      {resolvedPresets && resolvedPresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3 pb-2 border-b border-border/60 bg-muted/30">
          {resolvedPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePreset(preset)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium",
                "bg-background/60 text-muted-foreground border border-border/60",
                "hover:bg-accent hover:text-accent-foreground hover:border-accent",
                "transition-colors",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <DayPicker
        showOutsideDays={showOutsideDays}
        // `pointer-events-auto` keeps the calendar interactive when rendered
        // inside a Radix Popover/Dialog whose container disables pointer events
        // during open/close transitions.
        className={cn("p-3 pointer-events-auto", className)}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-sm font-semibold tracking-tight",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "ghost" }),
            "h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent",
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          // NOTE: react-day-picker v8 renders a real <table>. We force flex
          // layout on the row elements so the 7-column day grid lines up.
          table: "w-full border-collapse space-y-1",
          head_row: "flex w-full",
          head_cell:
            "text-muted-foreground/70 rounded-md w-9 font-medium text-[0.7rem] uppercase tracking-wider flex-1 text-center",
          row: "flex w-full mt-1.5",
          cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent/40 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
          day: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 p-0 font-normal rounded-md aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground transition-colors",
          ),
          day_range_end: "day-range-end",
          day_selected:
            "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "ring-1 ring-primary/50 text-foreground font-semibold",
          day_outside:
            "day-outside text-muted-foreground/50 aria-selected:bg-accent/40 aria-selected:text-muted-foreground aria-selected:opacity-40",
          day_disabled: "text-muted-foreground opacity-40",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
          IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        }}
        {...props}
      />
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
