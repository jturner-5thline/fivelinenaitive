import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { ManagementReviewDashboard } from '@/components/metrics/dashboards/ManagementReviewDashboard';
import { BenchmarkForecastsPage } from '@/components/metrics/dashboards/BenchmarkForecastsPage';
import { KeyMetricsPage } from '@/components/metrics/dashboards/KeyMetricsPage';
import { AgendaEditor } from '@/components/insights/AgendaEditor';
import {
  ReportCoverSection,
  QuarterlyInsightsReportPage,
  useQuarterlyReportState,
  createQuarterlyReportSeed,
} from '@/components/metrics/dashboards/QuarterlyInsightsReport';

/**
 * Multi-page export preview. Renders the full Insights report as separate,
 * stacked "pages" (Cover, Agenda, Dashboard, Forecasts, Key Metrics, JT, JM,
 * SW) inside a scrollable dialog. Each page is a print-page-break boundary
 * so browser Print produces one page per section.
 */

function CoverPage() {
  const { state, setState } = useQuarterlyReportState(
    createQuarterlyReportSeed(),
    'naitive.quarterlyReport.v1.report1',
  );
  // Match the Agenda page's dark gradient treatment. The Agenda uses the
  // `.n` surface inside the app's `.insights-glass-skin` scope; the export
  // dialog portals outside that scope so we apply the gradient inline here.
  return (
    <div
      className="rounded-md p-6 text-white insights-glass-skin export-cover-dark"
      style={{
        background:
          'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 20px 60px -20px rgba(0, 0, 0, 0.65)',
      }}
    >
      <style>{`
        .export-cover-dark .glass-module,
        .export-cover-dark .qir-cover-card {
          background: transparent !important;
          background-color: transparent !important;
          border-color: rgba(255,255,255,0.10) !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
        }
        .export-cover-dark .qir-cover-hero { background: transparent !important; }
      `}</style>
      <ReportCoverSection s={state} set={setState} />
    </div>
  );
}

function ReportPage({ reportKey, defaultAuthor, persona }: { reportKey: string; defaultAuthor: string; persona: string }) {
  const seed = { ...createQuarterlyReportSeed(), authors: [defaultAuthor] } as any;
  const { state, setState, reset, save, print, canEdit, isDirty, isSaving, activeCompositeKey, fetchedCompositeKey, unsavedChangesWarning } =
    useQuarterlyReportState(seed, `qir-export:${reportKey}`);
  return (
    <QuarterlyInsightsReportPage
      s={state}
      set={setState}
      reset={reset}
      save={save}
      print={print}
      canEdit={false}
      reportKey={reportKey}
      titlePrefix={persona}
      ownerName={defaultAuthor}
      activeCompositeKey={activeCompositeKey}
      fetchedCompositeKey={fetchedCompositeKey}
      isDirty={isDirty}
      isSaving={isSaving}
      unsavedChangesWarning={unsavedChangesWarning}
    />
  );
}

const PAGES: { id: string; title: string; render: () => JSX.Element }[] = [
  { id: 'cover',       title: 'Cover',            render: () => <CoverPage /> },
  { id: 'agenda',      title: 'Agenda',           render: () => <AgendaEditor /> },
  { id: 'dashboard',   title: 'Insights Dashboard', render: () => <ManagementReviewDashboard /> },
  { id: 'forecasts',   title: 'Benchmark Forecasts', render: () => <BenchmarkForecastsPage /> },
  { id: 'key-metrics', title: 'Key Metrics',      render: () => <KeyMetricsPage /> },
  { id: 'jt',          title: 'Quarterly Insights Report — JT', render: () => <ReportPage reportKey="report-1" defaultAuthor="James Turner" persona="JT" /> },
  { id: 'jm',          title: 'Quarterly Insights Report — JM', render: () => <ReportPage reportKey="report-2" defaultAuthor="John Moffitt" persona="JM" /> },
  { id: 'sw',          title: 'Quarterly Insights Report — SW', render: () => <ReportPage reportKey="report-3" defaultAuthor="Scott Williams" persona="SW" /> },
];

export function ExportAllPagesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1280px] w-[95vw] h-[92vh] p-0 flex flex-col bg-background overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex flex-row items-start justify-between gap-4 shrink-0">
          <div>
            <DialogTitle>Export report preview</DialogTitle>
            <DialogDescription>
              Cover, Agenda, Dashboard, Forecasts, Key Metrics, JT, JM and SW — each on its own page.
            </DialogDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1 mt-1">
            <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
          </Button>
        </DialogHeader>
        <ScrollArea className="flex-1 export-report-scroll">
          <div className="px-6 py-6 space-y-8">
            {PAGES.map((p, i) => {
              const isCover = p.id === 'cover';
              return (
                <section
                  key={p.id}
                  aria-label={p.title}
                  className={
                    isCover
                      ? 'export-report-page rounded-md overflow-hidden'
                      : 'export-report-page bg-card border rounded-md shadow-sm overflow-hidden'
                  }
                  style={{ pageBreakAfter: i === PAGES.length - 1 ? 'auto' : 'always', breakAfter: i === PAGES.length - 1 ? 'auto' : 'page' }}
                >
                  <div
                    className={
                      isCover
                        ? 'px-5 py-3 flex items-center justify-between text-white/80 border-b border-white/10'
                        : 'px-5 py-3 border-b bg-muted/30 flex items-center justify-between'
                    }
                    style={isCover ? { background: 'linear-gradient(135deg, #020208 0%, #050d1f 50%, #040008 100%)' } : undefined}
                  >
                    <div className={isCover ? 'text-[11px] uppercase tracking-wider text-white/60' : 'text-[11px] uppercase tracking-wider text-muted-foreground'}>
                      Page {i + 1} of {PAGES.length}
                    </div>
                    <div className="text-sm font-semibold">{p.title}</div>
                  </div>
                  <div className={isCover ? '' : 'p-5'}>
                    {p.render()}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
