import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDealStages } from "@/contexts/DealStagesContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  Clock,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Save,
  Trash2,
  X,
  Activity,
  FastForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, parseISO, intervalToDuration } from "date-fns";
import { toast } from "sonner";

interface Props {
  dealId: string;
}

interface StageHistoryRow {
  id: string;
  deal_id: string;
  pipeline_id: string | null;
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
  changed_by: string | null;
}

interface StageNote {
  id: string;
  stage_history_id: string;
  note: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface ProfileLite {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface PipelineLite {
  id: string;
  name: string;
  stages: { id: string; label: string; color: string }[];
}

interface TimelineRow {
  history: StageHistoryRow;
  fromLabel: string;
  toLabel: string;
  toColor: string;
  pipelineName: string | null;
  authorName: string;
  authorAvatar: string | null;
  durationLabel: string | null; // time spent in this stage (until next change or now)
  note: StageNote | null;
}

function formatDuration(fromIso: string, toIso: string | null) {
  const from = new Date(fromIso);
  const to = toIso ? new Date(toIso) : new Date();
  const dur = intervalToDuration({ start: from, end: to });
  const parts: string[] = [];
  if (dur.years) parts.push(`${dur.years}y`);
  if (dur.months) parts.push(`${dur.months}mo`);
  if (dur.days) parts.push(`${dur.days}d`);
  if (parts.length === 0) {
    if (dur.hours) parts.push(`${dur.hours}h`);
    if (dur.minutes && parts.length < 2) parts.push(`${dur.minutes}m`);
  }
  return parts.length > 0 ? parts.join(" ") : "<1m";
}

export function DealStageTimeline({ dealId }: Props) {
  const { user } = useAuth();
  const { stages: defaultStages } = useDealStages();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StageHistoryRow[]>([]);
  const [notes, setNotes] = useState<Record<string, StageNote>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [pipelines, setPipelines] = useState<Record<string, PipelineLite>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: hist, error: hErr } = await supabase
        .from("deal_stage_history")
        .select("id, deal_id, pipeline_id, from_stage, to_stage, changed_at, changed_by")
        .eq("deal_id", dealId)
        .order("changed_at", { ascending: false });
      if (hErr) throw hErr;
      const rows = (hist || []) as StageHistoryRow[];
      setHistory(rows);

      // Notes
      const histIds = rows.map(r => r.id);
      if (histIds.length > 0) {
        const { data: ns } = await supabase
          .from("deal_stage_history_notes")
          .select("id, stage_history_id, note, user_id, created_at, updated_at")
          .in("stage_history_id", histIds);
        const noteMap: Record<string, StageNote> = {};
        for (const n of (ns || []) as StageNote[]) noteMap[n.stage_history_id] = n;
        setNotes(noteMap);
      } else {
        setNotes({});
      }

      // Profiles for changed_by
      const userIds = [...new Set(rows.map(r => r.changed_by).filter(Boolean) as string[])];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, email, avatar_url")
          .in("user_id", userIds);
        const pMap: Record<string, ProfileLite> = {};
        for (const p of (profs || []) as ProfileLite[]) pMap[p.user_id] = p;
        setProfiles(pMap);
      } else {
        setProfiles({});
      }

      // Pipelines (for stage label resolution per pipeline_id)
      const pipelineIds = [...new Set(rows.map(r => r.pipeline_id).filter(Boolean) as string[])];
      if (pipelineIds.length > 0) {
        const { data: pipes } = await supabase
          .from("deal_pipelines")
          .select("id, name, stages")
          .in("id", pipelineIds);
        const pipeMap: Record<string, PipelineLite> = {};
        for (const p of pipes || []) {
          const stages = Array.isArray(p.stages)
            ? (p.stages as any[]).filter(s => s && typeof s.id === "string")
            : [];
          pipeMap[p.id] = { id: p.id, name: p.name, stages: stages as any };
        }
        setPipelines(pipeMap);
      } else {
        setPipelines({});
      }
    } catch (e: any) {
      setError(e.message || "Failed to load stage history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dealId) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const rows: TimelineRow[] = useMemo(() => {
    if (history.length === 0) return [];
    // history is desc; build rows with duration = changed_at[i-1] - changed_at[i] (next change in time)
    return history.map((h, idx) => {
      const nextNewer = idx > 0 ? history[idx - 1].changed_at : null; // newer row above (desc list)
      const pipeline = h.pipeline_id ? pipelines[h.pipeline_id] : null;
      const stagesForLookup = pipeline?.stages?.length ? pipeline.stages : defaultStages;
      const labelOf = (id: string | null) => {
        if (!id) return "—";
        const found = stagesForLookup.find(s => s.id === id);
        return found?.label || id.replace(/-/g, " ");
      };
      const colorOf = (id: string) => {
        const found = stagesForLookup.find(s => s.id === id);
        return found?.color || "bg-primary";
      };
      const profile = h.changed_by ? profiles[h.changed_by] : null;
      return {
        history: h,
        fromLabel: labelOf(h.from_stage),
        toLabel: labelOf(h.to_stage),
        toColor: colorOf(h.to_stage),
        pipelineName: pipeline?.name || null,
        authorName: profile?.display_name || profile?.email || "Unknown",
        authorAvatar: profile?.avatar_url || null,
        durationLabel: formatDuration(h.changed_at, nextNewer),
        note: notes[h.id] || null,
      };
    });
  }, [history, notes, profiles, pipelines, defaultStages]);

  /* ---------- Note actions ---------- */

  const beginEdit = (historyId: string, existing?: string) => {
    setEditingId(historyId);
    setDraftText(existing || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftText("");
  };

  const saveNote = async (row: TimelineRow) => {
    if (!user) return;
    const trimmed = draftText.trim();
    if (!trimmed) {
      toast.error("Note cannot be empty");
      return;
    }
    setSavingId(row.history.id);
    try {
      if (row.note) {
        const { error } = await supabase
          .from("deal_stage_history_notes")
          .update({ note: trimmed })
          .eq("id", row.note.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("deal_stage_history_notes")
          .insert({
            stage_history_id: row.history.id,
            deal_id: row.history.deal_id,
            user_id: user.id,
            note: trimmed,
          });
        if (error) throw error;
      }
      toast.success("Note saved");
      setEditingId(null);
      setDraftText("");
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to save note");
    } finally {
      setSavingId(null);
    }
  };

  const deleteNote = async (note: StageNote) => {
    setSavingId(note.stage_history_id);
    try {
      const { error } = await supabase
        .from("deal_stage_history_notes")
        .delete()
        .eq("id", note.id);
      if (error) throw error;
      toast.success("Note removed");
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove note");
    } finally {
      setSavingId(null);
    }
  };

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground space-y-2">
          <Activity className="h-6 w-6 mx-auto opacity-60" />
          <p className="text-sm">No stage changes recorded for this deal yet.</p>
          <p className="text-xs">Stage changes are tracked automatically as the deal progresses.</p>
        </CardContent>
      </Card>
    );
  }

  const totalChanges = rows.length;
  const currentStage = rows[0];
  const firstChange = rows[rows.length - 1];
  const lifetime = formatDuration(firstChange.history.changed_at, null);

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current stage</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("h-2 w-2 rounded-full", currentStage.toColor)} />
              <span className="text-sm font-medium truncate">{currentStage.toLabel}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">for {currentStage.durationLabel}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stage changes</div>
            <div className="text-2xl font-semibold">{totalChanges}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Deal lifetime</div>
            <div className="text-2xl font-semibold">{lifetime}</div>
            <div className="text-xs text-muted-foreground mt-0.5">since first stage</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Stage timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[60vh]">
            <ol className="relative border-l border-border/60 ml-6 my-4 space-y-4 pr-4">
              {rows.map((row, idx) => {
                const isEditing = editingId === row.history.id;
                const isSaving = savingId === row.history.id;
                const ts = parseISO(row.history.changed_at);
                const isCurrent = idx === 0;
                return (
                  <li key={row.history.id} className="ml-5 relative">
                    <span
                      className={cn(
                        "absolute -left-[28px] top-1 flex items-center justify-center h-5 w-5 rounded-full ring-4 ring-background",
                        row.toColor,
                        "text-white"
                      )}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </span>
                    <div className={cn(
                      "rounded-md border bg-card/40 p-3 space-y-2",
                      isCurrent ? "border-primary/40" : "border-border/60"
                    )}>
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-xs text-muted-foreground capitalize">{row.fromLabel}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium capitalize">{row.toLabel}</span>
                          {isCurrent && <Badge variant="default" className="h-5 text-[10px]">Current</Badge>}
                          {row.pipelineName && (
                            <Badge variant="outline" className="h-5 text-[10px]">
                              {row.pipelineName}
                            </Badge>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(ts, { addSuffix: true })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{format(ts, "PP p")}</TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>by <span className="text-foreground/80 font-medium">{row.authorName}</span></span>
                        <span className="flex items-center gap-1">
                          <FastForward className="h-3 w-3" />
                          {idx === 0 ? `in this stage ${row.durationLabel}` : `was in this stage ${row.durationLabel}`}
                        </span>
                      </div>

                      {/* Note */}
                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            placeholder="Why did this change happen? Add context for the team…"
                            className="text-sm min-h-[60px]"
                            autoFocus
                          />
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isSaving} className="h-7">
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" onClick={() => saveNote(row)} disabled={isSaving || !draftText.trim()} className="h-7">
                              {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : row.note ? (
                        <div className="rounded bg-muted/40 px-2.5 py-2 text-sm text-foreground/90 space-y-1.5">
                          <p className="whitespace-pre-wrap">{row.note.note}</p>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {row.note.user_id === user?.id ? "You" : (profiles[row.note.user_id]?.display_name || "Teammate")}
                              {" · "}
                              {formatDistanceToNow(parseISO(row.note.updated_at), { addSuffix: true })}
                            </span>
                            {row.note.user_id === user?.id && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => beginEdit(row.history.id, row.note?.note)} disabled={isSaving}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => row.note && deleteNote(row.note)} disabled={isSaving}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => beginEdit(row.history.id)}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <MessageSquarePlus className="h-3 w-3 mr-1.5" />
                          Add note
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}