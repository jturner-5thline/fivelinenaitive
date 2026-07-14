import { diceCoefficient } from '@/utils/stringSimilarity';
import type { Task } from '@/hooks/useTasks';

/** Normalize a task title for fuzzy comparison. */
function normalizeTitle(t: string): string {
  return (t || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|for|to|of|and|with|re|fwd|follow up|followup|update|task|please|pls)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SimilarPairScore {
  score: number;
  titleScore: number;
  sharesDeal: boolean;
  sharesContact: boolean;
  sharesCompany: boolean;
}

/** Score similarity between two tasks. 0 = unrelated, 1 = near-identical. */
export function scoreTaskPair(a: Task, b: Task): SimilarPairScore {
  const titleScore = diceCoefficient(normalizeTitle(a.title), normalizeTitle(b.title));
  const sharesDeal = !!a.deal_id && a.deal_id === b.deal_id;
  const sharesContact = !!a.contact_id && a.contact_id === b.contact_id;
  const sharesCompany = !!a.crm_company_id && a.crm_company_id === b.crm_company_id;
  let boost = 0;
  if (sharesDeal) boost += 0.18;
  if (sharesContact) boost += 0.10;
  if (sharesCompany) boost += 0.10;
  // Small boost when at least one association matches, to help medium title
  // scores clear the grouping threshold when clearly on the same subject.
  const score = Math.min(1, titleScore + boost);
  return { score, titleScore, sharesDeal, sharesContact, sharesCompany };
}

export interface SimilarTaskGroup {
  /** Task IDs in the group, ordered by created_at desc. */
  taskIds: string[];
  /** Best pairwise score inside the group. */
  topScore: number;
  /** True if every task in the group shares the same deal. */
  allShareDeal: boolean;
  allShareContact: boolean;
  allShareCompany: boolean;
}

export interface FindSimilarOptions {
  /** Minimum blended score for two tasks to be considered similar. Default 0.55. */
  threshold?: number;
  /** If true, ignore completed / archived tasks. Default true. */
  openOnly?: boolean;
}

/**
 * Find clusters of potentially duplicate tasks. Uses a union-find so a
 * task connected to any similar peer joins the same group.
 */
export function findSimilarTaskGroups(
  tasks: Task[],
  opts: FindSimilarOptions = {},
): SimilarTaskGroup[] {
  const threshold = opts.threshold ?? 0.55;
  const openOnly = opts.openOnly ?? true;

  const candidates = tasks.filter(t => {
    if (!t.title || t.title.trim().length < 3) return false;
    if (openOnly) {
      if (t.status === 'complete') return false;
      if (t.archived_at) return false;
    }
    return true;
  });

  const n = candidates.length;
  if (n < 2) return [];

  // Union-find
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const topScore = new Map<number, number>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = scoreTaskPair(candidates[i], candidates[j]);
      if (s.score >= threshold) {
        union(i, j);
        const root = find(i);
        const prev = topScore.get(root) ?? 0;
        if (s.score > prev) topScore.set(root, s.score);
      }
    }
  }

  const bucket = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = bucket.get(r) || [];
    arr.push(i);
    bucket.set(r, arr);
  }

  const groups: SimilarTaskGroup[] = [];
  for (const [root, idxs] of bucket) {
    if (idxs.length < 2) continue;
    const groupTasks = idxs.map(i => candidates[i]);
    groupTasks.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const firstDeal = groupTasks[0].deal_id;
    const firstContact = groupTasks[0].contact_id;
    const firstCompany = groupTasks[0].crm_company_id;
    groups.push({
      taskIds: groupTasks.map(t => t.id),
      topScore: topScore.get(root) ?? 0,
      allShareDeal: !!firstDeal && groupTasks.every(t => t.deal_id === firstDeal),
      allShareContact: !!firstContact && groupTasks.every(t => t.contact_id === firstContact),
      allShareCompany: !!firstCompany && groupTasks.every(t => t.crm_company_id === firstCompany),
    });
  }

  groups.sort((a, b) => b.topScore - a.topScore);
  return groups;
}