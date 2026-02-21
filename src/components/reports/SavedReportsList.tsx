import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Clock,
  Play,
  Eye,
  Lock,
  Globe,
  Users,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { NaitiveIcon } from '@/components/NaitiveIcon';
import {
  useReportDefinitions,
  useDeleteReportDefinition,
  type ReportDefinition,
} from '@/hooks/useReportDefinitions';
import { useRunReportNow } from '@/hooks/useScheduledReports';
import { ReportBuilderDialog } from './ReportBuilderDialog';
import { ScheduleReportDialog } from './ScheduleReportDialog';
import { ReportPreviewDialog } from './ReportPreviewDialog';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function SavedReportsList() {
  const { data: reports, isLoading } = useReportDefinitions();
  const deleteReport = useDeleteReportDefinition();
  const [editingReport, setEditingReport] = useState<ReportDefinition | null>(null);
  const [schedulingReport, setSchedulingReport] = useState<ReportDefinition | null>(null);
  const [previewingReport, setPreviewingReport] = useState<ReportDefinition | null>(null);

  const visibilityIcon = (v: string) => {
    switch (v) {
      case 'org': return <Globe className="h-3 w-3" />;
      case 'team': return <Users className="h-3 w-3" />;
      default: return <Lock className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!reports?.length) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            My Reports
            <Badge variant="secondary" className="ml-auto">{reports.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => (
              <Card
                key={report.id}
                className="group hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setPreviewingReport(report)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {visibilityIcon(report.visibility)}
                      <h4 className="font-medium text-sm truncate">{report.name}</h4>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreviewingReport(report); }}>
                          <Eye className="h-4 w-4 mr-2" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingReport(report); }}>
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSchedulingReport(report); }}>
                          <Clock className="h-4 w-4 mr-2" /> Schedule
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReport.mutate(report.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {report.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {report.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {report.report_widgets?.length || 0} widgets
                    </Badge>
                    {report.ai_summary_enabled && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <NaitiveIcon className="h-2.5 w-2.5" /> AI
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {format(new Date(report.updated_at), 'MMM d')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {editingReport && (
        <ReportBuilderDialog
          open={!!editingReport}
          onOpenChange={(open) => !open && setEditingReport(null)}
          existingReport={editingReport}
        />
      )}

      {schedulingReport && (
        <ScheduleReportDialog
          open={!!schedulingReport}
          onOpenChange={(open) => !open && setSchedulingReport(null)}
          report={schedulingReport}
        />
      )}

      {previewingReport && (
        <ReportPreviewDialog
          open={!!previewingReport}
          onOpenChange={(open) => !open && setPreviewingReport(null)}
          report={previewingReport}
        />
      )}
    </>
  );
}
