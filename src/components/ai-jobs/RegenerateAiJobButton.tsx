// ─────────────────────────────────────────────────────────────────────────────
// RegenerateAiJobButton — one-click "run this AI job now" button that
// enqueues an ai_jobs row and shows live queued/running/completed/failed
// status via the polling hook.
//
// This is the canonical way to offer a manual regenerate for any async AI
// output (rundown refresh, portfolio sweep, digest, doc regen). Drop it in
// wherever the user needs to say "redo this in the background".
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  useEnqueueAiJob,
  useAiJob,
  type KnownJobType,
} from "@/hooks/aiJobs/useAiJob";
import { AiJobStatusBadge } from "./AiJobStatusBadge";

interface Props {
  jobType: KnownJobType;
  /** Short label for the toast + badge (e.g. "Portfolio sweep"). */
  label: string;
  companyId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** dedupeKey collapses concurrent clicks into one in-flight job. */
  dedupeKey?: string | null;
  input?: Record<string, unknown>;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost" | "default";
  /** Fires with the final row when the job reaches a terminal state. */
  onFinished?: (job: {
    status: string;
    output: Record<string, unknown> | null;
    error: string | null;
  }) => void;
}

export function RegenerateAiJobButton({
  jobType,
  label,
  companyId,
  entityType,
  entityId,
  dedupeKey,
  input,
  size = "sm",
  variant = "outline",
  onFinished,
}: Props) {
  const { enqueue, isEnqueueing } = useEnqueueAiJob();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { job } = useAiJob(activeJobId);

  // Fire onFinished exactly once per terminal transition. We compare against
  // the previous status to avoid re-firing on unrelated re-renders (e.g.
  // parent state changes) once the job has already settled.
  const [lastNotified, setLastNotified] = useState<string | null>(null);
  useEffect(() => {
    if (!job) return;
    const terminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled";
    if (terminal && lastNotified !== job.id + job.status) {
      setLastNotified(job.id + job.status);
      onFinished?.({
        status: job.status,
        output: job.output,
        error: job.error,
      });
      if (job.status === "failed") {
        toast({
          title: `${label} failed`,
          description: job.error?.slice(0, 200) ?? "Unknown error",
          variant: "destructive",
        });
      } else if (job.status === "completed") {
        toast({ title: `${label} finished` });
      }
    }
  }, [job, label, lastNotified, onFinished]);

  const handleClick = async () => {
    const res = await enqueue({
      job_type: jobType,
      company_id: companyId ?? null,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      dedupe_key: dedupeKey ?? null,
      input: input ?? {},
    });
    if (res.error) {
      toast({
        title: `Couldn't queue ${label.toLowerCase()}`,
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    if (res.alreadyInFlight) {
      toast({
        title: `${label} is already running`,
        description: "Attached to the in-flight job.",
      });
    } else {
      toast({ title: `${label} queued` });
    }
    if (res.job?.id) setActiveJobId(res.job.id);
  };

  const busy =
    isEnqueueing || job?.status === "queued" || job?.status === "running";

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={busy}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`}
        />
        {busy ? "Working…" : `Regenerate ${label}`}
      </Button>
      {job?.status && <AiJobStatusBadge status={job.status} />}
    </div>
  );
}
