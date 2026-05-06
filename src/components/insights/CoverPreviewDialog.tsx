import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ReportCoverSection,
  createQuarterlyReportSeed,
  useQuarterlyReportState,
} from '@/components/metrics/dashboards/QuarterlyInsightsReport';

/**
 * On-demand preview of the Insights report Cover (front matter).
 *
 * The Cover used to render inline on the /insights page; per product
 * direction it is now hidden from the main dashboard flow and only
 * appears when an admin/user explicitly opens this preview, or as part
 * of the report save/export flow.
 */
export function CoverPreviewDialog({
  open,
  onOpenChange,
  reportKey = 'naitive.quarterlyReport.v1.report1',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportKey?: string;
}) {
  const report = useQuarterlyReportState(createQuarterlyReportSeed(), reportKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 bg-background">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Report Cover preview</DialogTitle>
          <DialogDescription>
            Front matter as it will appear when this report is saved or exported. This is not part of the live dashboard view.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 pt-2">
          <ReportCoverSection s={report.state} set={report.setState} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
