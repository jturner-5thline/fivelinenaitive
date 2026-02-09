/**
 * Convert a deal type ID (e.g., "growth-capital") to a display label (e.g., "Growth Capital").
 * Falls back to title-casing the ID if no match is found in the provided options.
 */
export function dealTypeIdToLabel(id: string, dealTypes?: { id: string; label: string }[]): string {
  if (dealTypes) {
    const match = dealTypes.find(dt => dt.id === id);
    if (match) return match.label;
  }
  // Fallback: convert kebab-case to Title Case
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert an array of deal type IDs to their display labels.
 */
export function dealTypeIdsToLabels(ids: string[], dealTypes?: { id: string; label: string }[]): string[] {
  return ids.map(id => dealTypeIdToLabel(id, dealTypes));
}
