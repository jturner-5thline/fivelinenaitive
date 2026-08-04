import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Drilldown filters for the efficiency-by-activity card: date range (preset or
 * custom), user segment, and deal type. All three are optional — an empty
 * selection means "everything", which is how the underlying reports behave when
 * their filter arguments are null.
 */

export type RangePreset = "inherit" | "24h" | "7d" | "30d" | "90d" | "custom";

export interface EfficiencyFilterState {
  preset: RangePreset;
  customStart: Date | null;
  customEnd: Date | null;
  userIds: string[];
  dealClasses: string[];
  engagementTypes: string[];
}

export const EMPTY_EFFICIENCY_FILTERS: EfficiencyFilterState = {
  preset: "inherit",
  customStart: null,
  customEnd: null,
  userIds: [],
  dealClasses: [],
  engagementTypes: [],
};

const PRESET_HOURS: Record<Exclude<RangePreset, "inherit" | "custom">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

const PRESET_LABELS: Record<RangePreset, string> = {
  inherit: "Page range",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range",
};

const DEAL_CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  naitive: "nAItive",
  finserv: "FinServ",
};

/** Resolve the effective window, falling back to the page-level range. */
export function resolveEfficiencyWindow(
  filters: EfficiencyFilterState,
  fallbackStart: Date,
  fallbackEnd: Date,
): { start: Date; end: Date; label: string } {
  if (filters.preset === "custom" && filters.customStart) {
    const start = new Date(filters.customStart);
    start.setHours(0, 0, 0, 0);
    const end = filters.customEnd ? new Date(filters.customEnd) : new Date();
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
    };
  }
  if (filters.preset !== "inherit" && filters.preset !== "custom") {
    const end = new Date();
    const start = new Date(end.getTime() - PRESET_HOURS[filters.preset] * 3600_000);
    return { start, end, label: PRESET_LABELS[filters.preset].replace("Last ", "") };
  }
  return { start: fallbackStart, end: fallbackEnd, label: "" };
}

export function countActiveFilters(f: EfficiencyFilterState): number {
  return (
    (f.preset !== "inherit" ? 1 : 0) +
    (f.userIds.length ? 1 : 0) +
    (f.dealClasses.length ? 1 : 0) +
    (f.engagementTypes.length ? 1 : 0)
  );
}

interface FilterOption {
  kind: string;
  value: string;
  label: string;
  calls: number;
}

/** Generic multi-select popover backed by a searchable command list. */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyText,
  disabled,
}: {
  label: string;
  options: { value: string; label: string; hint?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyText: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  const summary =
    selected.length === 0
      ? `All ${label.toLowerCase()}`
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? "1 selected")
        : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-8 justify-between gap-2 text-xs", selected.length > 0 && "border-primary/50")}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span className="truncate max-w-[140px]">{summary}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0 pointer-events-auto" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected.includes(o.value) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && (
                    <span className="text-[11px] text-muted-foreground ml-2">{o.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.length > 0 && (
          <div className="border-t border-border/60 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => onChange([])}
            >
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ApiEfficiencyFilters({
  value,
  onChange,
  optionsStart,
  optionsEnd,
  reloadKey,
}: {
  value: EfficiencyFilterState;
  onChange: (next: EfficiencyFilterState) => void;
  /** Window used to discover which users actually made calls. */
  optionsStart: Date;
  optionsEnd: Date;
  reloadKey: number;
}) {
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [rangeOpen, setRangeOpen] = useState(false);

  const startIso = optionsStart.toISOString();
  const endIso = optionsEnd.toISOString();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("api_usage_filter_options" as never, {
        _start: startIso,
        _end: endIso,
      } as never);
      if (cancelled || error) return;
      setOptions((data as unknown as FilterOption[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [startIso, endIso, reloadKey]);

  const userOptions = useMemo(
    () =>
      options
        .filter((o) => o.kind === "user")
        .map((o) => ({ value: o.value, label: o.label, hint: `${o.calls} calls` })),
    [options],
  );
  const dealClassOptions = useMemo(
    () =>
      options
        .filter((o) => o.kind === "deal_class")
        .map((o) => ({
          value: o.value,
          label: DEAL_CLASS_LABELS[o.value] ?? o.value,
          hint: `${o.calls} deals`,
        })),
    [options],
  );
  const engagementOptions = useMemo(
    () =>
      options
        .filter((o) => o.kind === "engagement_type")
        .map((o) => ({ value: o.value, label: o.label, hint: `${o.calls} deals` })),
    [options],
  );

  const activeCount = countActiveFilters(value);

  const rangeSummary =
    value.preset === "custom" && value.customStart
      ? `${format(value.customStart, "MMM d")} – ${
          value.customEnd ? format(value.customEnd, "MMM d") : "now"
        }`
      : PRESET_LABELS[value.preset];

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60">
      {/* Date range */}
      <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-2 text-xs",
              value.preset !== "inherit" && "border-primary/50",
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {rangeSummary}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <div className="flex flex-col p-2 gap-1 border-b border-border/60">
            {(["inherit", "24h", "7d", "30d", "90d"] as RangePreset[]).map((p) => (
              <Button
                key={p}
                variant={value.preset === p ? "secondary" : "ghost"}
                size="sm"
                className="h-7 justify-start text-xs"
                onClick={() => {
                  onChange({ ...value, preset: p });
                  setRangeOpen(false);
                }}
              >
                {PRESET_LABELS[p]}
              </Button>
            ))}
          </div>
          <div className="p-2">
            <div className="text-[11px] text-muted-foreground px-1 pb-1">
              Or pick a custom start / end
            </div>
            <Calendar
              mode="range"
              selected={{
                from: value.customStart ?? undefined,
                to: value.customEnd ?? undefined,
              }}
              onSelect={(r) =>
                onChange({
                  ...value,
                  preset: r?.from ? "custom" : value.preset,
                  customStart: r?.from ?? null,
                  customEnd: r?.to ?? null,
                })
              }
              numberOfMonths={1}
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
        </PopoverContent>
      </Popover>

      <MultiSelect
        label="Users"
        options={userOptions}
        selected={value.userIds}
        onChange={(userIds) => onChange({ ...value, userIds })}
        emptyText="No users made AI calls in this window."
      />

      <MultiSelect
        label="Deal type"
        options={dealClassOptions}
        selected={value.dealClasses}
        onChange={(dealClasses) => onChange({ ...value, dealClasses })}
        emptyText="No deal types found."
      />

      <MultiSelect
        label="Engagement"
        options={engagementOptions}
        selected={value.engagementTypes}
        onChange={(engagementTypes) => onChange({ ...value, engagementTypes })}
        emptyText="No engagement types found."
      />

      {activeCount > 0 && (
        <>
          <Badge variant="secondary" className="text-[11px]">
            {activeCount} filter{activeCount === 1 ? "" : "s"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => onChange(EMPTY_EFFICIENCY_FILTERS)}
          >
            <X className="h-3 w-3" /> Reset
          </Button>
        </>
      )}
    </div>
  );
}
