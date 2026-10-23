/** Completion is derived from these two persisted status fields. */
export function openItemCompletionUpdates(completed: boolean) {
  return { received: completed, approved: completed };
}

export function moveOpenItem<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): T[] | null {
  const index = items.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const reordered = [...items];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}