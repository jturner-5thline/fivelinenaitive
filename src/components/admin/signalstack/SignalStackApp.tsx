import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Route,
  MessageSquareQuote,
  BrainCircuit,
  Bot,
  ShieldCheck,
  LayoutGrid,
  Settings as SettingsIcon,
  Search,
  Download,
  Moon,
  Sun,
  Calendar,
} from "lucide-react";
import { OverviewPage } from "./OverviewPage";
import { JourneysPage } from "./JourneysPage";
import { FeedbackPage } from "./FeedbackPage";
import { AITrainingPage } from "./AITrainingPage";
import { AIActionsPage } from "./AIActionsPage";
import { AuditLogPage } from "./AuditLogPage";
import { IssueClustersPage } from "./IssueClustersPage";
import { SettingsPage } from "./SettingsPage";

type SectionId =
  | "overview"
  | "journeys"
  | "feedback"
  | "ai-training"
  | "ai-actions"
  | "audit-log"
  | "issue-clusters"
  | "settings";

const NAV: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }>; group?: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Command" },
  { id: "journeys", label: "Journeys", icon: Route, group: "Signals" },
  { id: "feedback", label: "Feedback", icon: MessageSquareQuote, group: "Signals" },
  { id: "ai-training", label: "AI Training", icon: BrainCircuit, group: "AI" },
  { id: "ai-actions", label: "AI Actions", icon: Bot, group: "AI" },
  { id: "audit-log", label: "Audit Log", icon: ShieldCheck, group: "AI" },
  { id: "issue-clusters", label: "Issue Clusters", icon: LayoutGrid, group: "Workspace" },
  { id: "settings", label: "Settings", icon: SettingsIcon, group: "Workspace" },
];

const SECTION_META: Record<SectionId, { title: string; subtitle: string }> = {
  overview: { title: "Command center", subtitle: "Where users struggle, what they say, what AI learned, and what AI did." },
  journeys: { title: "Journeys", subtitle: "Funnel, drop-off, friction hotspots." },
  feedback: { title: "Feedback", subtitle: "Voice of customer, themed and traced." },
  "ai-training": { title: "AI Training", subtitle: "Prompt library, freshness, coverage, failure." },
  "ai-actions": { title: "AI Actions", subtitle: "Operational oversight of every AI action." },
  "audit-log": { title: "Audit Log", subtitle: "Evidence-first compliance trail." },
  "issue-clusters": { title: "Issue Clusters", subtitle: "Prioritization workspace across all signals." },
  settings: { title: "Settings", subtitle: "Weights, thresholds, owners, theme." },
};

/**
 * SignalStack — internal product & AI operations command center.
 * Mock-data driven. Renders inside the Admin → Product Enhancement tab
 * as a self-contained app shell with sidebar + sticky top bar.
 */
export function SignalStackApp() {
  const [section, setSection] = React.useState<SectionId>("overview");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  const meta = SECTION_META[section];

  return (
    <div
      className={cn(
        "signalstack-shell -mx-5 -my-5 min-h-[800px] flex border-t border-border/60",
        theme === "dark" ? "dark bg-[hsl(220_18%_8%)] text-foreground" : "bg-background text-foreground",
      )}
      style={{
        // local design tokens — neutral surface + teal accent
        ["--ss-accent" as never]: "174 72% 48%",
      }}
    >
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 border-r border-border/60 bg-[hsl(220_18%_6%)]/60 backdrop-blur p-3 flex flex-col gap-1 hidden md:flex">
        <div className="flex items-center gap-2 px-2 py-3 mb-1">
          <div className="h-7 w-7 rounded-md bg-teal-500/20 ring-1 ring-teal-500/40 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-sm bg-teal-300" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight leading-none">SignalStack</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Product & AI ops</div>
          </div>
        </div>

        {Object.entries(groupBy(NAV, n => n.group ?? "")).map(([group, items]) => (
          <div key={group} className="mt-2">
            <div className="px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">{group}</div>
            {items.map(item => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-teal-500/10 text-teal-200 ring-1 ring-inset ring-teal-500/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        <div className="mt-auto px-2 py-2 text-[10px] text-muted-foreground">
          v0.1 · mock data
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky top bar */}
        <div className="sticky top-0 z-30 backdrop-blur bg-background/70 border-b border-border/60">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="text-base font-semibold tracking-tight truncate">{meta.title}</div>
              <div className="text-xs text-muted-foreground truncate">{meta.subtitle}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-[200px] hidden lg:block">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search signals…" className="h-8 pl-7 text-xs" />
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs hidden md:inline-flex">
                <Calendar className="h-3.5 w-3.5 mr-1" /> Last 7 days
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs hidden md:inline-flex">
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {section === "overview" && <OverviewPage onNavigate={(s) => setSection(s as SectionId)} />}
          {section === "journeys" && <JourneysPage />}
          {section === "feedback" && <FeedbackPage />}
          {section === "ai-training" && <AITrainingPage />}
          {section === "ai-actions" && <AIActionsPage />}
          {section === "audit-log" && <AuditLogPage />}
          {section === "issue-clusters" && <IssueClustersPage />}
          {section === "settings" && <SettingsPage theme={theme} onThemeChange={setTheme} />}
        </div>
      </div>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}