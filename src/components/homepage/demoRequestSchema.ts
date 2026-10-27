import { z } from "zod";

export const demoRequestSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email("Enter a valid work email address").max(255),
  company: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});