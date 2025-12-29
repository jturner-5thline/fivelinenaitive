/**
 * Currency formatting utilities for consistent number display across the app
 */

/**
 * Format a number with commas for display (no decimals)
 * @param value - The number to format
 * @returns Formatted string with commas (e.g., "1,500,000")
 */
export const formatCurrencyInputValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return '';
  return Math.round(value).toLocaleString('en-US');
};

/**
 * Format a string input with commas as the user types (no decimals)
 * @param value - The raw input string
 * @returns Formatted string with commas
 */
export const formatAmountWithCommas = (value: string): string => {
  // Remove any non-digit characters
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  // Add commas
  return parseInt(digits, 10).toLocaleString('en-US');
};

/**
 * Parse a comma-formatted currency string to a number
 * @param value - The formatted string (e.g., "1,500,000")
 * @returns The numeric value, or undefined if empty
 */
export const parseCurrencyInputValue = (value: string): number | undefined => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;
  return parseInt(digits, 10);
};

/**
 * Parse a comma-formatted currency string to a number (returns 0 if empty)
 * @param value - The formatted string (e.g., "1,500,000")
 * @returns The numeric value, or 0 if empty
 */
export const parseAmountToNumber = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
};
