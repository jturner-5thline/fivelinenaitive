// ─────────────────────────────────────────────────────────────────────────────
// AiJobStatusBadge — compact queued/running/completed/failed indicator.
//
// Deliberately minimal per the spec: "Keep user-facing UI simple: show
// queued, running, completed, or failed." Callers pair this with a
// regenerate button of their own (or reuse RegenerateAiJobButton) — the
// badge itself is display-only.
// ─────────────────────────────────────────────────────────────────────────────
import { Loader2, CheckCircle2, XCircle, Clock, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiJobStatus } from "@/hooks/aiJobs/useAiJob";

interface Props {
  status: AiJobStatus | null | undefined;
  /** Optional short label (e.g. "Sweep") shown before the status. */
  label?: string;
  className?: string;
}

const CONFIG: Record<
  AiJobStatus,
  { text: string; icon: typeof Clock; classes: string }
> = {
  queued: {
    text: "Queued",
    icon: Clock,
    classes: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  },
  running: {
    text: "Running",
    icon: Loader2,
    classes: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  completed: {
    text: "Completed",
    icon: CheckCircle2,
    classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  failed: {
    text: "Failed",
    icon: XCircle,
    classes: "bg-red-500/15 text-red-300 border-red-500/30",
  },
  cancelled: {
    text: "Cancelled",
    icon: MinusCircle,
    classes: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
};

export function AiJobStatusBadge({ status, label, className }: Props) {
  if (!status) return null;
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.classes,
        className,
      )}
    >
      <Icon
        className={cn("h-3 w-3", status === "running" && "animate-spin")}
      />
      {label ? `${label}: ${cfg.text}` : cfg.text}
    </span>
  );
}
