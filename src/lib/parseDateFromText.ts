/**
 * Parses natural language date references from text and returns the corresponding date.
 * Returns null if no date reference is found.
 */
export function parseDateFromText(text: string): Date | null {
  const lowerText = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to add days to a date
  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Helper to get next occurrence of a weekday (0 = Sunday, 1 = Monday, etc.)
  const getNextWeekday = (targetDay: number): Date => {
    const result = new Date(today);
    const currentDay = result.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // If today or past, get next week
    result.setDate(result.getDate() + daysUntil);
    return result;
  };

  // Check for relative dates
  if (/\b(today|tonight)\b/.test(lowerText)) {
    return today;
  }

  if (/\btomorrow\b/.test(lowerText)) {
    return addDays(today, 1);
  }

  if (/\b(day after tomorrow|in 2 days|in two days)\b/.test(lowerText)) {
    return addDays(today, 2);
  }

  if (/\bnext week\b/.test(lowerText)) {
    return addDays(today, 7);
  }

  if (/\bin a week\b/.test(lowerText)) {
    return addDays(today, 7);
  }

  if (/\bend of week\b/.test(lowerText)) {
    // Friday of this week
    const friday = getNextWeekday(5);
    // If today is already Friday or later, use this Friday
    if (today.getDay() >= 5) {
      const result = new Date(today);
      result.setDate(result.getDate() + (5 - today.getDay()));
      if (result < today) return addDays(result, 7);
      return result;
    }
    return friday;
  }

  // Check for "in X days" pattern
  const inDaysMatch = lowerText.match(/\bin (\d+|one|two|three|four|five|six|seven) days?\b/);
  if (inDaysMatch) {
    const numMap: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7
    };
    const days = numMap[inDaysMatch[1]] || parseInt(inDaysMatch[1], 10);
    if (!isNaN(days)) {
      return addDays(today, days);
    }
  }

  // Check for weekday names
  const weekdays = [
    { names: ['sunday', 'sun'], day: 0 },
    { names: ['monday', 'mon'], day: 1 },
    { names: ['tuesday', 'tue', 'tues'], day: 2 },
    { names: ['wednesday', 'wed'], day: 3 },
    { names: ['thursday', 'thu', 'thur', 'thurs'], day: 4 },
    { names: ['friday', 'fri'], day: 5 },
    { names: ['saturday', 'sat'], day: 6 },
  ];

  for (const { names, day } of weekdays) {
    const pattern = new RegExp(`\\b(on |by |this |next )?(${names.join('|')})\\b`, 'i');
    if (pattern.test(lowerText)) {
      return getNextWeekday(day);
    }
  }

  return null;
}

/**
 * Formats a date as YYYY-MM-DD for input[type="date"]
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
