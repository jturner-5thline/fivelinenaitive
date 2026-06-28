import { BarChart3, LineChart } from "lucide-react";

export type ChartType = "bar" | "line";

interface Props {
  value: ChartType;
  onChange: (v: ChartType) => void;
}

export function ChartTypeToggle({ value, onChange }: Props) {
  const btn = (active: boolean) =>
    `inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${
      active
        ? "bg-white/15 text-white"
        : "text-white/55 hover:text-white hover:bg-white/10"
    }`;
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded p-0.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
      role="group"
      aria-label="Chart type"
    >
      <button
        type="button"
        className={btn(value === "bar")}
        onClick={() => onChange("bar")}
        aria-pressed={value === "bar"}
        title="Bar chart"
      >
        <BarChart3 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btn(value === "line")}
        onClick={() => onChange("line")}
        aria-pressed={value === "line"}
        title="Line chart"
      >
        <LineChart className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}