import { useMemo, useState, useEffect, useCallback } from 'react';
import { Deal } from '@/types/deal';
import { diceCoefficient, normalizeDealName } from '@/utils/stringSimilarity';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface DuplicateCluster {
  id: string;
  primaryName: string;
  deals: Deal[];
  similarity: number; // average pairwise similarity
  suppressionKey: string; // deterministic key for suppression
}

const SIMILARITY_THRESHOLD = 0.8;

function buildSuppressionKey(dealIds: string[]): string {
  return [...dealIds].sort().join('__');
}

// Also build all pairwise keys for a set of deal IDs
function buildPairwiseKeys(dealIds: string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < dealIds.length; i++) {
    for (let j = i + 1; j < dealIds.length; j++) {
      keys.add(buildSuppressionKey([dealIds[i], dealIds[j]]));
    }
  }
  // Also add the full group key
  keys.add(buildSuppressionKey(dealIds));
  return keys;
}

export function useDealDuplicates(deals: Deal[], enabled: boolean): {
  clusters: DuplicateCluster[];
  isProcessing: boolean;
  suppressCluster: (cluster: DuplicateCluster) => Promise<void>;
} {
  const { company } = useCompany();
  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(new Set());
  const [suppressionVersion, setSuppressionVersion] = useState(0);

  // Load suppressions from DB
  useEffect(() => {
    if (!enabled || !company?.id) return;
    
    const load = async () => {
      const { data } = await supabase
        .from('duplicate_deal_suppressions')
        .select('suppression_key, deal_ids')
        .eq('company_id', company.id);
      
      if (data) {
        const keys = new Set<string>();
        for (const row of data) {
          keys.add(row.suppression_key);
          // Also add all pairwise keys from the deal_ids array
          if (Array.isArray(row.deal_ids)) {
            const pairwise = buildPairwiseKeys(row.deal_ids as string[]);
            pairwise.forEach(k => keys.add(k));
          }
        }
        setSuppressedKeys(keys);
      }
    };
    load();
  }, [enabled, company?.id, suppressionVersion]);

  const suppressCluster = useCallback(async (cluster: DuplicateCluster) => {
    if (!company?.id) throw new Error('No company');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const dealIds = cluster.deals.map(d => d.id);
    const key = buildSuppressionKey(dealIds);

    const { error } = await supabase
      .from('duplicate_deal_suppressions')
      .upsert({
        company_id: company.id,
        suppression_key: key,
        deal_ids: dealIds,
        created_by: user.id,
      }, { onConflict: 'company_id,suppression_key' });

    if (error) throw error;
    setSuppressionVersion(v => v + 1);
  }, [company?.id]);

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

      const dealIds = groupDeals.map(d => d.id);
      const suppKey = buildSuppressionKey(dealIds);

      // Check if this cluster or any pairwise combo is suppressed
      const pairKeys = buildPairwiseKeys(dealIds);
      const isSuppressed = suppressedKeys.has(suppKey) || 
        (groupDeals.length === 2 && [...pairKeys].some(k => suppressedKeys.has(k)));
      if (isSuppressed) continue;

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
        suppressionKey: suppKey,
      });
    }

    // Sort clusters by similarity descending
    result.sort((a, b) => b.similarity - a.similarity);
    return result;
  }, [deals, enabled, suppressedKeys]);

  return { clusters, isProcessing: false, suppressCluster };
}
