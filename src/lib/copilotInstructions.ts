export type CopilotLifecycleStage = { name: string; description?: string };

export type CopilotTone = "professional_concise" | "formal" | "casual";

export interface CopilotInstructions {
  company_description: string;
  lifecycle_stages: CopilotLifecycleStage[];
  tone: CopilotTone;
  team_structure: string;
  custom_instructions: string;
}

export const DEFAULT_COPILOT_INSTRUCTIONS: CopilotInstructions = {
  company_description:
    "5th Line is a debt advisory firm that helps growth-stage companies access capital markets through ABL, growth capital, CapEx financing, and acquisition financing.",
  lifecycle_stages: [
    { name: "NDA/Needs List Sent" },
    { name: "Initial Lender Review" },
    { name: "Proposal Issued" },
    { name: "Agreement Pending" },
    { name: "Terms Issued" },
    { name: "Final Credit Items" },
    { name: "In Due Diligence" },
    { name: "Funded" },
  ],
  tone: "professional_concise",
  team_structure: "",
  custom_instructions: "",
};

export const TONE_LABELS: Record<CopilotTone, string> = {
  professional_concise: "Professional / Concise",
  formal: "Formal",
  casual: "Casual",
};

const TONE_GUIDANCE: Record<CopilotTone, string> = {
  professional_concise:
    "Use a professional, concise tone. Skip preamble. Favor short sentences and scannable bullets. Be direct and action-oriented.",
  formal:
    "Use a formal, polished tone appropriate for institutional capital partners. Avoid slang and contractions. Prefer complete sentences and measured language.",
  casual:
    "Use a casual, conversational tone. Plain language, contractions are fine. Stay accurate, but feel free to be friendly.",
};

export function normalizeCopilotInstructions(raw: unknown): CopilotInstructions {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Partial<CopilotInstructions>;
  const stages = Array.isArray(r.lifecycle_stages)
    ? (r.lifecycle_stages as any[])
        .map((s) =>
          typeof s === "string"
            ? { name: s, description: "" }
            : { name: String(s?.name ?? "").trim(), description: String(s?.description ?? "") },
        )
        .filter((s) => s.name.length > 0)
    : DEFAULT_COPILOT_INSTRUCTIONS.lifecycle_stages;
  const tone = (["professional_concise", "formal", "casual"] as CopilotTone[]).includes(r.tone as CopilotTone)
    ? (r.tone as CopilotTone)
    : DEFAULT_COPILOT_INSTRUCTIONS.tone;
  return {
    company_description:
      typeof r.company_description === "string" && r.company_description.trim().length > 0
        ? r.company_description
        : DEFAULT_COPILOT_INSTRUCTIONS.company_description,
    lifecycle_stages: stages,
    tone,
    team_structure: typeof r.team_structure === "string" ? r.team_structure : "",
    custom_instructions: typeof r.custom_instructions === "string" ? r.custom_instructions : "",
  };
}

export function compileCopilotInstructions(raw: unknown): string {
  const ci = normalizeCopilotInstructions(raw);
  const stagesBlock = ci.lifecycle_stages
    .map((s, i) => {
      const desc = s.description?.trim();
      return `${i + 1}. ${s.name}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");
  const sections: string[] = [];
  sections.push("## Firm Profile");
  sections.push(ci.company_description.trim());
  sections.push("");
  sections.push("## Deal Lifecycle Stages");
  sections.push(stagesBlock);
  sections.push("");
  sections.push("## Communication Tone");
  sections.push(TONE_GUIDANCE[ci.tone]);
  if (ci.team_structure.trim()) {
    sections.push("");
    sections.push("## Team Structure");
    sections.push(ci.team_structure.trim());
  }
  if (ci.custom_instructions.trim()) {
    sections.push("");
    sections.push("## Custom Instructions");
    sections.push(ci.custom_instructions.trim());
  }
  return sections.join("\n");
}