import { z } from "zod";

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, "Invalid calendar date.");
export const calendarTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour, Central time).");
export const calendarType = z.enum(["note", "meeting", "deadline"]);
export const calendarTitle = z.string().trim().min(1).max(300);
export const calendarNotes = z.string().max(2000);
