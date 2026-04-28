import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export const LABEL_COLOR_TOKENS = [
  "amber",
  "emerald",
  "sky",
  "violet",
  "rose",
  "slate",
  "orange",
  "teal",
  "fuchsia",
] as const;
export type LabelColor = (typeof LABEL_COLOR_TOKENS)[number] | string;

export interface EmailLabel {
  id: string;
  user_id: string;
  name: string;
  color: LabelColor;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailLabelAssignment {
  id: string;
  label_id: string;
  user_id: string;
  thread_id: string;
  message_id: string | null;
  applied_by: string;
  applied_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────

function useUserId() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUid(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return uid;
}

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

const LABELS_KEY = ["email-labels"] as const;
const ASSIGNMENTS_KEY = ["email-label-assignments"] as const;

/** All labels for the current user, ordered by sort_order then name. */
export function useLabels() {
  const uid = useUserId();
  return useQuery({
    queryKey: [...LABELS_KEY, uid] as const,
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<EmailLabel[]> => {
      const { data, error } = await (supabase as any)
        .from("email_labels")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailLabel[];
    },
  });
}

/**
 * All label assignments for the current user.
 * Returned as a flat list — components derive thread→labels maps from it.
 */
export function useAllLabelAssignments() {
  const uid = useUserId();
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, uid] as const,
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<EmailLabelAssignment[]> => {
      const { data, error } = await (supabase as any)
        .from("email_label_assignments")
        .select("*");
      if (error) throw error;
      return (data ?? []) as EmailLabelAssignment[];
    },
  });
}

/**
 * Convenience: build a Map<thread_id, EmailLabel[]> in component state.
 * Pass the labels list and assignments list (both already loaded).
 */
export function buildThreadLabelMap(
  labels: EmailLabel[],
  assignments: EmailLabelAssignment[],
): Map<string, EmailLabel[]> {
  const byId = new Map(labels.map((l) => [l.id, l] as const));
  const out = new Map<string, EmailLabel[]>();
  for (const a of assignments) {
    const lab = byId.get(a.label_id);
    if (!lab) continue;
    const arr = out.get(a.thread_id) ?? [];
    if (!arr.find((x) => x.id === lab.id)) arr.push(lab);
    out.set(a.thread_id, arr);
  }
  return out;
}

/** Thread IDs assigned to a given label (for folder view filtering). */
export function threadIdsForLabel(
  labelId: string,
  assignments: EmailLabelAssignment[],
): Set<string> {
  const out = new Set<string>();
  for (const a of assignments) if (a.label_id === labelId) out.add(a.thread_id);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Mutations: labels CRUD
// ─────────────────────────────────────────────────────────────────

function invalidateLabels(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: LABELS_KEY });
}
function invalidateAssignments(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      color?: LabelColor;
      icon?: string | null;
      description?: string | null;
    }) => {
      if (!uid) throw new Error("Not signed in");
      const name = input.name.trim();
      if (!name) throw new Error("Name is required");
      if (name.length > 32) throw new Error("Name must be 32 characters or fewer");
      const { data, error } = await (supabase as any)
        .from("email_labels")
        .insert({
          user_id: uid,
          name,
          color: input.color ?? "slate",
          icon: input.icon ?? null,
          description: input.description ?? null,
        })
        .select("*")
        .single();
      if (error) {
        // Map duplicate-name unique-violation to a friendlier message
        if ((error as any).code === "23505") {
          throw new Error("A label with that name already exists");
        }
        throw error;
      }
      return data as EmailLabel;
    },
    onSuccess: () => invalidateLabels(qc),
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<EmailLabel, "name" | "color" | "icon" | "description" | "sort_order">>;
    }) => {
      const patch: Record<string, unknown> = { ...input.patch };
      if (typeof patch.name === "string") {
        const trimmed = (patch.name as string).trim();
        if (!trimmed) throw new Error("Name is required");
        if (trimmed.length > 32) throw new Error("Name must be 32 characters or fewer");
        patch.name = trimmed;
      }
      const { data, error } = await (supabase as any)
        .from("email_labels")
        .update(patch)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) {
        if ((error as any).code === "23505") {
          throw new Error("A label with that name already exists");
        }
        throw error;
      }
      return data as EmailLabel;
    },
    onSuccess: () => invalidateLabels(qc),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("email_labels").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateLabels(qc);
      // assignments cascade-delete in the DB; refetch the cached list too.
      invalidateAssignments(qc);
    },
  });
}

/** Persist a new sort order. Pass label IDs in their desired order. */
export function useReorderLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Run sequentially to keep payloads small; volume is tiny (user labels).
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await (supabase as any)
          .from("email_labels")
          .update({ sort_order: i })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
      return orderedIds;
    },
    onSuccess: () => invalidateLabels(qc),
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations: thread ↔ label assignments
// ─────────────────────────────────────────────────────────────────

/** Apply a single label to a thread (idempotent thanks to the unique index). */
export function useApplyLabel() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async (input: { threadId: string; labelId: string; messageId?: string | null }) => {
      if (!uid) throw new Error("Not signed in");
      const row = {
        user_id: uid,
        applied_by: uid,
        thread_id: input.threadId,
        label_id: input.labelId,
        message_id: input.messageId ?? null,
      };
      // Upsert-style: ignore unique-violation so re-applying is a no-op.
      const { error } = await (supabase as any)
        .from("email_label_assignments")
        .insert(row);
      if (error && (error as any).code !== "23505") throw error;
      return row;
    },
    onSuccess: () => invalidateAssignments(qc),
  });
}

export function useRemoveLabel() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async (input: { threadId: string; labelId: string; messageId?: string | null }) => {
      if (!uid) throw new Error("Not signed in");
      let q = (supabase as any)
        .from("email_label_assignments")
        .delete()
        .eq("user_id", uid)
        .eq("label_id", input.labelId)
        .eq("thread_id", input.threadId);
      if (input.messageId === undefined || input.messageId === null) {
        q = q.is("message_id", null);
      } else {
        q = q.eq("message_id", input.messageId);
      }
      const { error } = await q;
      if (error) throw error;
      return input;
    },
    onSuccess: () => invalidateAssignments(qc),
  });
}

/**
 * Reconcile the full label set on a thread to exactly `labelIds`.
 * Adds missing assignments and removes ones no longer present.
 */
export function useSetLabels() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async (input: { threadId: string; labelIds: string[] }) => {
      if (!uid) throw new Error("Not signed in");
      const { data: existing, error: selErr } = await (supabase as any)
        .from("email_label_assignments")
        .select("id,label_id,message_id")
        .eq("user_id", uid)
        .eq("thread_id", input.threadId)
        .is("message_id", null);
      if (selErr) throw selErr;
      const existingIds = new Set<string>((existing ?? []).map((r: any) => r.label_id));
      const next = new Set(input.labelIds);

      const toAdd: string[] = [];
      next.forEach((id) => {
        if (!existingIds.has(id)) toAdd.push(id);
      });
      const toRemove: string[] = [];
      existingIds.forEach((id) => {
        if (!next.has(id)) toRemove.push(id);
      });

      if (toAdd.length) {
        const rows = toAdd.map((label_id) => ({
          user_id: uid,
          applied_by: uid,
          thread_id: input.threadId,
          label_id,
          message_id: null,
        }));
        const { error } = await (supabase as any)
          .from("email_label_assignments")
          .insert(rows);
        if (error && (error as any).code !== "23505") throw error;
      }
      if (toRemove.length) {
        const { error } = await (supabase as any)
          .from("email_label_assignments")
          .delete()
          .eq("user_id", uid)
          .eq("thread_id", input.threadId)
          .is("message_id", null)
          .in("label_id", toRemove);
        if (error) throw error;
      }
      return input;
    },
    onSuccess: () => invalidateAssignments(qc),
  });
}