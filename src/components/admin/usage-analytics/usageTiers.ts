export type UsageTier = "Free" | "Starter" | "Growth" | "Scale" | "Enterprise";

export interface UsageTierConfig {
  tier: UsageTier;
  /** Tailwind classes for the badge surface */
  badgeClass: string;
}

/** Default rate used to estimate AI cost. Configurable via the panel UI. */
export const DEFAULT_AI_RATE_PER_1K_TOKENS = 0.003;

export function classifyUsageTier(totalAiCalls: number): UsageTier {
  if (totalAiCalls <= 50) return "Free";
  if (totalAiCalls <= 200) return "Starter";
  if (totalAiCalls <= 500) return "Growth";
  if (totalAiCalls <= 2000) return "Scale";
  return "Enterprise";
}

export function tierBadgeClass(tier: UsageTier): string {
  switch (tier) {
    case "Free":       return "bg-muted/40 text-muted-foreground border border-border/40";
    case "Starter":    return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
    case "Growth":     return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    case "Scale":      return "bg-violet-500/15 text-violet-300 border border-violet-500/30";
    case "Enterprise": return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  }
}

export const PAID_TIERS: UsageTier[] = ["Growth", "Scale", "Enterprise"];

export function isPaidTier(tier: UsageTier): boolean {
  return PAID_TIERS.includes(tier);
}