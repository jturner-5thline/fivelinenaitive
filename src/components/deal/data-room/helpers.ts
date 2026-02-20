import type { UnifiedChecklistItem } from './types';

/** Simple string similarity score (0-1) using bigrams */
export function similarityScore(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersection = 0;
  ba.forEach(b => { if (bb.has(b)) intersection++; });
  return (2 * intersection) / (ba.size + bb.size);
}

/** Suggest checklist items for a given file name */
export function suggestMappings(
  fileName: string,
  items: UnifiedChecklistItem[],
  topN = 5
): { item: UnifiedChecklistItem; score: number }[] {
  const baseName = fileName.replace(/\.[^.]+$/, ''); // strip extension
  
  return items
    .map(item => ({
      item,
      score: Math.max(
        similarityScore(baseName, item.name),
        similarityScore(baseName, item.category || ''),
        // Boost if category word appears in filename
        (item.category && baseName.toLowerCase().includes(item.category.toLowerCase().split(' ')[0])) ? 0.4 : 0,
      ),
    }))
    .filter(r => r.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return '1 Day Ago';
  return `${days} Days Ago`;
}
