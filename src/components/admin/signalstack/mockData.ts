// SignalStack mock data — realistic fintech / deal-ops scenarios.
// All data is mocked. Shared across SignalStack pages so cross-links stay coherent.

export type Severity = "critical" | "high" | "medium" | "low";
export type ClusterStatus = "open" | "in_progress" | "monitoring" | "resolved";
export type ActionOutcome = "success" | "edited" | "overridden" | "failed" | "pending_review";
export type ConfidenceBand = "high" | "medium" | "low";

export interface IssueCluster {
  id: string;
  title: string;
  workflow: string;
  severity: Severity;
  score: number; // 0-100 weighted severity
  evidenceCount: number;
  feedbackCount: number;
  aiFailures: number;
  impactedUsers: number;
  owner: string;
  status: ClusterStatus;
  trend: "up" | "down" | "flat";
  signals: { behavior: number; feedback: number; aiFailure: number; business: number }; // 0-100
  linkedFeedback: string[]; // feedback ids
  linkedActions: string[]; // action ids
  experiments: string[];
  updatedAt: string;
}

export interface FeedbackItem {
  id: string;
  source: "NPS" | "Support" | "Interview" | "In-app" | "Call notes";
  theme: string;
  sentiment: "positive" | "neutral" | "negative";
  type: "feature_request" | "bug" | "usability" | "praise";
  quote: string;
  author: string;
  account: string;
  workflow: string;
  date: string;
}

export interface PromptVersion {
  id: string;
  name: string;
  workflow: string;
  version: string;
  prevVersion: string;
  updated: string;
  corpusFreshnessDays: number;
  coverage: number; // % workflow coverage
  failureRate: number; // 0-1
  hallucinationFlags: number;
  lowConfidence: number;
  owner: string;
  status: "production" | "staging" | "drafting" | "deprecated";
}

export interface AIAction {
  id: string;
  timestamp: string;
  actionType: string;
  workflow: string;
  reason: string;
  evidenceSource: string;
  outcome: ActionOutcome;
  confidence: number; // 0-1
  confidenceBand: ConfidenceBand;
  owner: string;
  humanOverride: boolean;
  overrideReason?: string;
  account: string;
  model: string;
  promptVersion: string;
  valueDelta: "value" | "delay" | "risk" | "escalation" | "neutral";
  inputSummary: string;
  outcomeNote: string;
}

export interface JourneyStep {
  name: string;
  users: number;
  completionRate: number; // 0-1
  avgDurationMin: number;
  frictionScore: number; // 0-100
}

export interface JourneyDef {
  id: string;
  name: string;
  segment: string;
  steps: JourneyStep[];
}

// --- Issue clusters --------------------------------------------------------
export const issueClusters: IssueCluster[] = [
  {
    id: "ic-001",
    title: "Onboarding company-setup confusion",
    workflow: "Onboarding",
    severity: "critical",
    score: 91,
    evidenceCount: 142,
    feedbackCount: 38,
    aiFailures: 12,
    impactedUsers: 47,
    owner: "Priya Shah",
    status: "in_progress",
    trend: "up",
    signals: { behavior: 88, feedback: 72, aiFailure: 41, business: 95 },
    linkedFeedback: ["fb-101", "fb-104", "fb-110"],
    linkedActions: ["ai-2041", "ai-2060"],
    experiments: ["EXP-12 Guided setup wizard"],
    updatedAt: "2026-05-25",
  },
  {
    id: "ic-002",
    title: "QuickBooks sync mismatch on entity mapping",
    workflow: "QBO Sync",
    severity: "high",
    score: 84,
    evidenceCount: 96,
    feedbackCount: 21,
    aiFailures: 29,
    impactedUsers: 33,
    owner: "Marcus Lin",
    status: "open",
    trend: "up",
    signals: { behavior: 64, feedback: 58, aiFailure: 89, business: 78 },
    linkedFeedback: ["fb-105", "fb-112"],
    linkedActions: ["ai-2032", "ai-2055"],
    experiments: [],
    updatedAt: "2026-05-24",
  },
  {
    id: "ic-003",
    title: "AI draft trust gap on deal summaries",
    workflow: "AI Deal Summaries",
    severity: "high",
    score: 78,
    evidenceCount: 71,
    feedbackCount: 26,
    aiFailures: 18,
    impactedUsers: 54,
    owner: "Dana Wright",
    status: "in_progress",
    trend: "flat",
    signals: { behavior: 52, feedback: 81, aiFailure: 67, business: 70 },
    linkedFeedback: ["fb-102", "fb-108", "fb-115"],
    linkedActions: ["ai-2044", "ai-2049"],
    experiments: ["EXP-09 Inline evidence cards"],
    updatedAt: "2026-05-25",
  },
  {
    id: "ic-004",
    title: "Permissions setup delay for new analysts",
    workflow: "Access Provisioning",
    severity: "medium",
    score: 62,
    evidenceCount: 44,
    feedbackCount: 11,
    aiFailures: 4,
    impactedUsers: 22,
    owner: "Priya Shah",
    status: "monitoring",
    trend: "down",
    signals: { behavior: 70, feedback: 41, aiFailure: 18, business: 55 },
    linkedFeedback: ["fb-109"],
    linkedActions: [],
    experiments: ["EXP-07 Role presets"],
    updatedAt: "2026-05-22",
  },
  {
    id: "ic-005",
    title: "Deal intake duplicates not auto-merged",
    workflow: "Deal Intake",
    severity: "medium",
    score: 58,
    evidenceCount: 38,
    feedbackCount: 9,
    aiFailures: 14,
    impactedUsers: 19,
    owner: "Marcus Lin",
    status: "open",
    trend: "up",
    signals: { behavior: 48, feedback: 39, aiFailure: 72, business: 50 },
    linkedFeedback: ["fb-103"],
    linkedActions: ["ai-2037"],
    experiments: [],
    updatedAt: "2026-05-25",
  },
  {
    id: "ic-006",
    title: "Stale lender records surfacing in routing",
    workflow: "Lender Routing",
    severity: "low",
    score: 41,
    evidenceCount: 22,
    feedbackCount: 4,
    aiFailures: 7,
    impactedUsers: 8,
    owner: "Dana Wright",
    status: "resolved",
    trend: "down",
    signals: { behavior: 30, feedback: 22, aiFailure: 48, business: 38 },
    linkedFeedback: [],
    linkedActions: ["ai-2029"],
    experiments: ["EXP-04 Stale record nudge"],
    updatedAt: "2026-05-18",
  },
];

// --- Feedback --------------------------------------------------------------
export const feedbackItems: FeedbackItem[] = [
  { id: "fb-101", source: "NPS", theme: "Onboarding", sentiment: "negative", type: "usability", quote: "Spent 40 minutes trying to figure out which legal entity to attach to my QuickBooks realm.", author: "Casey W.", account: "Northwind Capital", workflow: "Onboarding", date: "2026-05-23" },
  { id: "fb-102", source: "In-app", theme: "AI trust", sentiment: "negative", type: "usability", quote: "I never know if the AI summary actually read all the docs or just the cover page.", author: "Renee J.", account: "Harbor Lane Partners", workflow: "AI Deal Summaries", date: "2026-05-24" },
  { id: "fb-103", source: "Support", theme: "Deal intake", sentiment: "negative", type: "bug", quote: "Same deal got intaken twice because the email subject changed by one word.", author: "Tom B.", account: "Mariner Credit", workflow: "Deal Intake", date: "2026-05-22" },
  { id: "fb-104", source: "Interview", theme: "Onboarding", sentiment: "neutral", type: "feature_request", quote: "Would love a guided wizard for the first week instead of a checklist.", author: "Laila O.", account: "Cascadia Lending", workflow: "Onboarding", date: "2026-05-20" },
  { id: "fb-105", source: "Call notes", theme: "QBO sync", sentiment: "negative", type: "bug", quote: "Entity mapping flipped overnight after their new chart of accounts import.", author: "Internal CSM", account: "Bluefin BD", workflow: "QBO Sync", date: "2026-05-19" },
  { id: "fb-106", source: "NPS", theme: "Reporting", sentiment: "positive", type: "praise", quote: "The weekly digest is the only AI email I actually read.", author: "Mark E.", account: "Citra Capital", workflow: "Reporting", date: "2026-05-21" },
  { id: "fb-107", source: "In-app", theme: "Search", sentiment: "neutral", type: "feature_request", quote: "Need a way to search across deal notes and lender notes at the same time.", author: "Jules P.", account: "Northwind Capital", workflow: "Search", date: "2026-05-15" },
  { id: "fb-108", source: "Interview", theme: "AI trust", sentiment: "negative", type: "usability", quote: "Show me which paragraph the AI pulled the number from. Otherwise I redo the work.", author: "Sofia R.", account: "Harbor Lane Partners", workflow: "AI Deal Summaries", date: "2026-05-17" },
  { id: "fb-109", source: "Support", theme: "Permissions", sentiment: "negative", type: "usability", quote: "New analyst waited 3 days to see the pipeline. Lost momentum on a live deal.", author: "Pat K.", account: "Cascadia Lending", workflow: "Access Provisioning", date: "2026-05-12" },
  { id: "fb-110", source: "In-app", theme: "Onboarding", sentiment: "negative", type: "usability", quote: "I gave up halfway through and asked support to set it up for me.", author: "Avery T.", account: "Mariner Credit", workflow: "Onboarding", date: "2026-05-25" },
  { id: "fb-111", source: "NPS", theme: "Reporting", sentiment: "positive", type: "praise", quote: "Morning briefing replaced four standups. Keep it tight.", author: "Drew M.", account: "Harbor Lane Partners", workflow: "Reporting", date: "2026-05-18" },
  { id: "fb-112", source: "Support", theme: "QBO sync", sentiment: "negative", type: "bug", quote: "Bills missing from FinServ entity for week of May 12.", author: "Internal Finance", account: "Internal", workflow: "QBO Sync", date: "2026-05-16" },
  { id: "fb-115", source: "Call notes", theme: "AI trust", sentiment: "neutral", type: "feature_request", quote: "If the AI made a call, I want a one-click rollback. Not buried in audit log.", author: "Internal CSM", account: "Bluefin BD", workflow: "AI Deal Summaries", date: "2026-05-14" },
];

// --- Prompts ---------------------------------------------------------------
export const promptVersions: PromptVersion[] = [
  { id: "pv-01", name: "deal_summary_v4", workflow: "AI Deal Summaries", version: "4.2.1", prevVersion: "4.1.0", updated: "2026-05-22", corpusFreshnessDays: 3, coverage: 82, failureRate: 0.07, hallucinationFlags: 4, lowConfidence: 11, owner: "Dana Wright", status: "production" },
  { id: "pv-02", name: "qbo_entity_mapper", workflow: "QBO Sync", version: "2.0.3", prevVersion: "1.9.2", updated: "2026-04-30", corpusFreshnessDays: 27, coverage: 64, failureRate: 0.18, hallucinationFlags: 9, lowConfidence: 23, owner: "Marcus Lin", status: "production" },
  { id: "pv-03", name: "onboarding_guide", workflow: "Onboarding", version: "1.4.0", prevVersion: "1.3.1", updated: "2026-05-10", corpusFreshnessDays: 15, coverage: 71, failureRate: 0.12, hallucinationFlags: 3, lowConfidence: 18, owner: "Priya Shah", status: "staging" },
  { id: "pv-04", name: "deal_intake_classifier", workflow: "Deal Intake", version: "3.1.0", prevVersion: "3.0.4", updated: "2026-05-20", corpusFreshnessDays: 5, coverage: 90, failureRate: 0.05, hallucinationFlags: 1, lowConfidence: 6, owner: "Marcus Lin", status: "production" },
  { id: "pv-05", name: "lender_router", workflow: "Lender Routing", version: "2.3.0", prevVersion: "2.2.0", updated: "2026-03-12", corpusFreshnessDays: 74, coverage: 58, failureRate: 0.22, hallucinationFlags: 12, lowConfidence: 31, owner: "Dana Wright", status: "production" },
  { id: "pv-06", name: "next_best_action", workflow: "Deal Workspace", version: "1.0.0-beta", prevVersion: "—", updated: "2026-05-24", corpusFreshnessDays: 1, coverage: 45, failureRate: 0.14, hallucinationFlags: 5, lowConfidence: 22, owner: "Dana Wright", status: "drafting" },
  { id: "pv-07", name: "task_router", workflow: "Tasks", version: "1.6.2", prevVersion: "1.5.0", updated: "2026-05-19", corpusFreshnessDays: 6, coverage: 88, failureRate: 0.04, hallucinationFlags: 0, lowConfidence: 4, owner: "Priya Shah", status: "production" },
];

// --- AI Actions ------------------------------------------------------------
export const aiActions: AIAction[] = [
  { id: "ai-2060", timestamp: "2026-05-25T14:42:00Z", actionType: "Drafted onboarding email", workflow: "Onboarding", reason: "New account stuck on step 3 for 18h", evidenceSource: "session: sess_82a · feedback: fb-110", outcome: "edited", confidence: 0.71, confidenceBand: "medium", owner: "Priya Shah", humanOverride: true, overrideReason: "Tone too formal for SMB segment", account: "Mariner Credit", model: "google/gemini-2.5-pro", promptVersion: "onboarding_guide@1.4.0", valueDelta: "value", inputSummary: "Account=Mariner Credit, blocked_step=entity_mapping, last_activity=18h", outcomeNote: "Sent after CSM edit. Customer replied within 22 minutes." },
  { id: "ai-2055", timestamp: "2026-05-25T13:10:00Z", actionType: "Flagged QBO entity mismatch", workflow: "QBO Sync", reason: "Realm 9341 split into two entities overnight", evidenceSource: "sync_log: 8821", outcome: "success", confidence: 0.94, confidenceBand: "high", owner: "Marcus Lin", humanOverride: false, account: "Bluefin BD", model: "openai/gpt-5", promptVersion: "qbo_entity_mapper@2.0.3", valueDelta: "value", inputSummary: "Realm=9341, prior_entities=1, new_entities=2", outcomeNote: "Escalation auto-routed to finance owner. Resolved in 2h." },
  { id: "ai-2049", timestamp: "2026-05-25T11:55:00Z", actionType: "Generated deal summary", workflow: "AI Deal Summaries", reason: "User opened deal space and clicked Summarize", evidenceSource: "docs: 14 · emails: 6", outcome: "overridden", confidence: 0.62, confidenceBand: "medium", owner: "Dana Wright", humanOverride: true, overrideReason: "AI missed revised LOI from May 22", account: "Harbor Lane Partners", model: "google/gemini-2.5-pro", promptVersion: "deal_summary_v4@4.2.1", valueDelta: "risk", inputSummary: "Deal=HLP-Q2-2026, doc_count=14, last_doc=2026-05-22", outcomeNote: "User rewrote summary. Logged as low-confidence training example." },
  { id: "ai-2044", timestamp: "2026-05-25T10:30:00Z", actionType: "Generated deal summary", workflow: "AI Deal Summaries", reason: "Scheduled morning briefing", evidenceSource: "docs: 9 · emails: 3", outcome: "success", confidence: 0.88, confidenceBand: "high", owner: "Dana Wright", humanOverride: false, account: "Citra Capital", model: "google/gemini-2.5-pro", promptVersion: "deal_summary_v4@4.2.1", valueDelta: "value", inputSummary: "Deal=CC-Acme, doc_count=9", outcomeNote: "Included in morning briefing email." },
  { id: "ai-2041", timestamp: "2026-05-25T09:14:00Z", actionType: "Suggested next best action", workflow: "Onboarding", reason: "Account inactivity > 24h on company setup", evidenceSource: "session: sess_77c", outcome: "pending_review", confidence: 0.58, confidenceBand: "low", owner: "Priya Shah", humanOverride: false, account: "Cascadia Lending", model: "openai/gpt-5-mini", promptVersion: "next_best_action@1.0.0-beta", valueDelta: "neutral", inputSummary: "Account=Cascadia, inactivity=27h, segment=mid-market", outcomeNote: "Awaiting CSM review in AI queue." },
  { id: "ai-2037", timestamp: "2026-05-24T17:02:00Z", actionType: "Auto-merged duplicate intake", workflow: "Deal Intake", reason: "92% match on company + amount + sender", evidenceSource: "deals: dl_443, dl_447", outcome: "failed", confidence: 0.82, confidenceBand: "high", owner: "Marcus Lin", humanOverride: true, overrideReason: "Actually two separate deals from same sponsor", account: "Mariner Credit", model: "openai/gpt-5", promptVersion: "deal_intake_classifier@3.1.0", valueDelta: "delay", inputSummary: "Match=0.92, company=Acme, amount=$2.4M", outcomeNote: "Reverted by ops. Added to training set as negative." },
  { id: "ai-2032", timestamp: "2026-05-24T15:48:00Z", actionType: "Escalated sync failure", workflow: "QBO Sync", reason: "Three consecutive sync failures on bill imports", evidenceSource: "sync_log: 8801, 8804, 8807", outcome: "success", confidence: 0.96, confidenceBand: "high", owner: "Marcus Lin", humanOverride: false, account: "Internal", model: "openai/gpt-5-mini", promptVersion: "qbo_entity_mapper@2.0.3", valueDelta: "escalation", inputSummary: "Failures=3, window=2h", outcomeNote: "On-call notified. Engineer patched within 40 minutes." },
  { id: "ai-2029", timestamp: "2026-05-24T11:21:00Z", actionType: "Routed task to owner", workflow: "Tasks", reason: "Deal touched by 2 owners, picked most recent", evidenceSource: "task: tsk_991", outcome: "success", confidence: 0.91, confidenceBand: "high", owner: "Priya Shah", humanOverride: false, account: "Northwind Capital", model: "openai/gpt-5-mini", promptVersion: "task_router@1.6.2", valueDelta: "value", inputSummary: "Owners=[Casey, Drew], last_touch=Drew", outcomeNote: "Task accepted in 4 minutes." },
];

// --- Journeys --------------------------------------------------------------
export const journeys: JourneyDef[] = [
  {
    id: "j-onboarding",
    name: "New account onboarding",
    segment: "Mid-market lenders",
    steps: [
      { name: "Invite accepted", users: 184, completionRate: 0.97, avgDurationMin: 2, frictionScore: 8 },
      { name: "Company setup", users: 178, completionRate: 0.72, avgDurationMin: 28, frictionScore: 81 },
      { name: "QBO connection", users: 128, completionRate: 0.84, avgDurationMin: 9, frictionScore: 42 },
      { name: "First deal added", users: 108, completionRate: 0.91, avgDurationMin: 14, frictionScore: 23 },
      { name: "First AI summary", users: 98, completionRate: 0.88, avgDurationMin: 5, frictionScore: 19 },
    ],
  },
  {
    id: "j-deal-intake",
    name: "Deal intake to first lender route",
    segment: "All accounts",
    steps: [
      { name: "Email received", users: 542, completionRate: 0.99, avgDurationMin: 1, frictionScore: 4 },
      { name: "Auto-classified", users: 537, completionRate: 0.93, avgDurationMin: 1, frictionScore: 18 },
      { name: "Duplicate check", users: 499, completionRate: 0.88, avgDurationMin: 2, frictionScore: 36 },
      { name: "Owner assigned", users: 439, completionRate: 0.94, avgDurationMin: 6, frictionScore: 17 },
      { name: "First lender routed", users: 413, completionRate: 0.81, avgDurationMin: 38, frictionScore: 44 },
    ],
  },
  {
    id: "j-ai-summary",
    name: "AI summary review",
    segment: "Power users",
    steps: [
      { name: "Opened deal space", users: 312, completionRate: 1.0, avgDurationMin: 1, frictionScore: 6 },
      { name: "Clicked Summarize", users: 312, completionRate: 0.97, avgDurationMin: 1, frictionScore: 8 },
      { name: "Reviewed summary", users: 302, completionRate: 0.78, avgDurationMin: 4, frictionScore: 52 },
      { name: "Accepted or edited", users: 236, completionRate: 0.64, avgDurationMin: 7, frictionScore: 68 },
      { name: "Shared with team", users: 151, completionRate: 0.83, avgDurationMin: 2, frictionScore: 21 },
    ],
  },
];

// --- KPI rollups -----------------------------------------------------------
export const overviewKpis = {
  journeyHealth: { value: 72, delta: -4, trend: [78, 76, 75, 73, 71, 72, 72] },
  feedbackRisk: { value: 58, delta: 6, trend: [42, 45, 49, 53, 55, 57, 58] },
  trainingFreshness: { value: 81, delta: 2, trend: [76, 78, 79, 79, 80, 80, 81] },
  actionSuccess: { value: 87, delta: 1, trend: [84, 85, 85, 86, 86, 87, 87] },
};

// 7-day convergence: behavior friction, feedback negativity, ai failure, business impact
export const convergenceSeries = [
  { day: "Mon", behavior: 48, feedback: 41, aiFailure: 32, business: 55 },
  { day: "Tue", behavior: 52, feedback: 47, aiFailure: 38, business: 58 },
  { day: "Wed", behavior: 61, feedback: 53, aiFailure: 44, business: 62 },
  { day: "Thu", behavior: 67, feedback: 58, aiFailure: 51, business: 70 },
  { day: "Fri", behavior: 72, feedback: 64, aiFailure: 49, business: 74 },
  { day: "Sat", behavior: 69, feedback: 62, aiFailure: 47, business: 71 },
  { day: "Sun", behavior: 74, feedback: 66, aiFailure: 52, business: 78 },
];

export const themePulse = [
  { theme: "Onboarding", volume: 38, sentiment: -0.62, change: 18 },
  { theme: "AI trust", volume: 26, sentiment: -0.51, change: 12 },
  { theme: "QBO sync", volume: 21, sentiment: -0.44, change: 7 },
  { theme: "Reporting", volume: 14, sentiment: 0.41, change: -3 },
  { theme: "Permissions", volume: 11, sentiment: -0.33, change: -2 },
  { theme: "Search", volume: 9, sentiment: 0.04, change: 1 },
];

export const execInsight = {
  weekly: "Onboarding friction surged 18% this week, driven by company-setup confusion on the QuickBooks step. AI trust complaints on deal summaries rose alongside a measurable dip in user acceptance.",
  risks: [
    "Onboarding completion is down 5 pts week-over-week — 12 mid-market accounts at risk of stalling.",
    "QBO entity mapper running on a 27-day-old corpus while customer chart-of-accounts patterns evolve.",
    "Deal-summary AI confidence below 0.7 on 18% of runs; users overriding twice as often as last month.",
  ],
  opportunities: [
    "Guided onboarding wizard (EXP-12) is showing 31% faster company-setup in its 14-account pilot.",
    "Inline evidence cards (EXP-09) cut AI-summary edit rate from 42% to 26% on the cohort that has them.",
    "Task router has hit 96% success — extend the same routing pattern to lender follow-ups.",
  ],
  next: [
    "Promote EXP-12 to 100% of new mid-market accounts.",
    "Refresh QBO entity mapper corpus with last 30 days of chart-of-account imports.",
    "Add evidence citations to deal_summary_v4 prompt; ship as 4.3.0.",
  ],
};

// --- Audit events ----------------------------------------------------------
export interface AuditEvent {
  id: string;
  timestamp: string;
  model: string;
  promptVersion: string;
  sourceEvidence: string;
  inputSummary: string;
  action: string;
  outcome: string;
  reviewer: string;
  overrideReason?: string;
  customer: string;
  workflow: string;
}

export const auditEvents: AuditEvent[] = aiActions.map(a => ({
  id: `au-${a.id.replace("ai-", "")}`,
  timestamp: a.timestamp,
  model: a.model,
  promptVersion: a.promptVersion,
  sourceEvidence: a.evidenceSource,
  inputSummary: a.inputSummary,
  action: a.actionType,
  outcome: a.outcome,
  reviewer: a.humanOverride ? a.owner : "—",
  overrideReason: a.overrideReason,
  customer: a.account,
  workflow: a.workflow,
}));