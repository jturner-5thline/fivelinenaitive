import { useMemo } from 'react';
import { Deal } from '@/types/deal';
import { diceCoefficient, normalizeDealName } from '@/utils/stringSimilarity';

export interface DuplicateCluster {
  id: string;
  primaryName: string;
  deals: Deal[];
  similarity: number; // average pairwise similarity
}

const SIMILARITY_THRESHOLD = 0.8;

export function useDealDuplicates(deals: Deal[], enabled: boolean): {
  clusters: DuplicateCluster[];
  isProcessing: boolean;
} {
  const clusters = useMemo(() => {
    if (!enabled || deals.length === 0) return [];

    // Build normalized names once
    const normalized = deals.map(d => ({
      deal: d,
      norm: normalizeDealName(d.company || d.name),
    }));

    // Union-Find for clustering
    const parent = new Map<string, string>();
    const find = (id: string): string => {
      if (!parent.has(id)) parent.set(id, id);
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      // path compression
      let curr = id;
      while (curr !== root) {
        const next = parent.get(curr)!;
        parent.set(curr, root);
        curr = next;
      }
      return root;
    };
    const union = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // Pairwise similarity — for performance, skip empty names and use early-out
    const similarities = new Map<string, number>();
    for (let i = 0; i < normalized.length; i++) {
      if (!normalized[i].norm) continue;
      for (let j = i + 1; j < normalized.length; j++) {
        if (!normalized[j].norm) continue;
        
        // Quick length check: if lengths differ by more than 50%, skip
        const lenRatio = normalized[i].norm.length / normalized[j].norm.length;
        if (lenRatio < 0.4 || lenRatio > 2.5) continue;

        const sim = diceCoefficient(normalized[i].norm, normalized[j].norm);
        if (sim >= SIMILARITY_THRESHOLD) {
          const key = `${normalized[i].deal.id}|${normalized[j].deal.id}`;
          similarities.set(key, sim);
          union(normalized[i].deal.id, normalized[j].deal.id);
        }
      }
    }

    // Group by cluster root
    const groups = new Map<string, Deal[]>();
    for (const { deal } of normalized) {
      const root = find(deal.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(deal);
    }

    // Build clusters (only groups with 2+ deals)
    const result: DuplicateCluster[] = [];
    for (const [, groupDeals] of groups) {
      if (groupDeals.length < 2) continue;

      // Calculate average similarity
      let totalSim = 0, pairCount = 0;
      for (let i = 0; i < groupDeals.length; i++) {
        for (let j = i + 1; j < groupDeals.length; j++) {
          const key = `${groupDeals[i].id}|${groupDeals[j].id}`;
          const reverseKey = `${groupDeals[j].id}|${groupDeals[i].id}`;
          totalSim += similarities.get(key) || similarities.get(reverseKey) || 0;
          pairCount++;
        }
      }

      // Sort by most recently updated first
      groupDeals.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      result.push({
        id: groupDeals[0].id,
        primaryName: groupDeals[0].company || groupDeals[0].name,
        deals: groupDeals,
        similarity: pairCount > 0 ? totalSim / pairCount : 0,
      });
    }

    // Sort clusters by similarity descending
    result.sort((a, b) => b.similarity - a.similarity);
    return result;
  }, [deals, enabled]);

  return { clusters, isProcessing: false };
}
