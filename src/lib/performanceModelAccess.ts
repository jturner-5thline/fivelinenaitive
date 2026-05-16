/**
 * Single source of truth for who can edit Niki's Performance plan model.
 * Used by both the UI (button visibility, edit-mode toggle) and the
 * plan hook (setTarget/resetAll guards) so frontend hiding can't be
 * bypassed via state manipulation or direct invocation.
 */
const PERFORMANCE_MODEL_EDITORS = new Set<string>([
  'jtutner@5thline.co',
]);

export function canEditPerformanceModel(
  user: { email?: string | null } | null | undefined,
): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return PERFORMANCE_MODEL_EDITORS.has(email);
}