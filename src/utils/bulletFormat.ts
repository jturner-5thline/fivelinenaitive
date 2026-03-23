/**
 * Toggle bullet-point formatting on plain-text lines.
 * Each non-empty line gets a leading "• " when enabled,
 * or has it stripped when disabled.
 */
export function applyBullets(value: string, enabled: boolean): string {
  return value
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (!trimmed) return line; // keep blank lines as-is
      if (enabled) {
        // Add bullet only if not already present
        return trimmed.startsWith('• ') ? line : `• ${trimmed}`;
      }
      // Strip leading bullet
      return trimmed.startsWith('• ') ? trimmed.slice(2) : trimmed;
    })
    .join('\n');
}
