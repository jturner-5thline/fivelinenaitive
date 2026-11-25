import { z } from "zod";
export const milestoneTitle = z.string().trim().min(1).max(500);
export const milestoneDueDate = z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Must be an ISO date or timestamp");
export const milestoneStatus = z.string().trim().min(1).max(60);
export const milestonePosition = z.number().int().min(0).max(10000);
export const writeControls = {
  expected_updated_at: z.string().datetime({ offset: true }).optional().describe("Reject with a conflict if the row changed since this updated_at."),
  dry_run: z.boolean().default(true).describe("Preview only (default). Set false to write after the user approves."),
};
