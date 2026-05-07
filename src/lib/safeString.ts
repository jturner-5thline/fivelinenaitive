/**
 * Defensive string helpers for AI/async/optional values.
 * Prevents "Cannot read properties of undefined (reading 'replace')" crashes.
 */
export const asText = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

export const safeReplace = (
  value: unknown,
  searchValue: string | RegExp,
  replaceValue: string,
): string => asText(value).replace(searchValue, replaceValue);