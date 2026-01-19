import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { 
  FileText, 
  Download, 
  Calendar, 
  TrendingUp, 
  Users, 
  Building2, 
  DollarSign,
  Clock,
  Filter,
  FileSpreadsheet,
  FileType,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useDealsContext } from '@/contexts/DealsContext';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { reportGenerators } from '@/utils/reportGenerator';
import { CustomReportBuilder } from '@/components/reports/CustomReportBuilder';

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category: 'pipeline' | 'lender' | 'performance' | 'financial';
  formats: ('pdf' | 'csv' | 'xlsx')[];
}

const reportTypes: ReportType[] = [
  {
    id: 'pipeline-summary',
    name: 'Pipeline Summary',
    description: 'Overview of all active deals by stage and status',
    icon: TrendingUp,
    category: 'pipeline',
    formats: ['pdf', 'csv', 'xlsx'],
  },
  {
    id: 'deal-activity',
    name: 'Deal Activity Report',
    description: 'Detailed activity log for all deals in selected period',
    icon: Clock,
    category: 'pipeline',
    formats: ['pdf', 'csv'],
  },
  {
    id: 'stage-progression',
    name: 'Stage Progression',
    description: 'Track how deals move through pipeline stages over time',
    icon: TrendingUp,
    category: 'pipeline',
    formats: ['pdf', 'xlsx'],
  },
  {
    id: 'lender-performance',
    name: 'Lender Performance',
    description: 'Analysis of lender response rates and terms offered',
    icon: Building2,
    category: 'lender',
    formats: ['pdf', 'csv', 'xlsx'],
  },
  {
    id: 'lender-engagement',
    name: 'Lender Engagement',
    description: 'Summary of lender interactions and outreach status',
    icon: Users,
    category: 'lender',
    formats: ['pdf', 'csv'],
  },
  {
    id: 'pass-analysis',
    name: 'Pass Reason Analysis',
    description: 'Breakdown of why lenders passed on deals',
    icon: FileText,
    category: 'lender',
    formats: ['pdf', 'csv'],
  },
  {
    id: 'team-performance',
    name: 'Team Performance',
    description: 'Deal manager performance metrics and comparisons',
    icon: Users,
    category: 'performance',
    formats: ['pdf', 'xlsx'],
  },
  {
    id: 'conversion-metrics',
    name: 'Conversion Metrics',
    description: 'Deal conversion rates by stage, type, and manager',
    icon: TrendingUp,
    category: 'performance',
    formats: ['pdf', 'csv'],
  },
  {
    id: 'fee-summary',
    name: 'Fee Summary',
    description: 'Overview of fees collected and projected by period',
    icon: DollarSign,
    category: 'financial',
    formats: ['pdf', 'xlsx'],
  },
  {
    id: 'revenue-forecast',
    name: 'Revenue Forecast',
    description: 'Projected revenue based on pipeline and success rates',
    icon: TrendingUp,
    category: 'financial',
    formats: ['pdf', 'xlsx'],
  },
];

const categoryLabels = {
  pipeline: 'Pipeline Reports',
  lender: 'Lender Reports',
  performance: 'Performance Reports',
  financial: 'Financial Reports',
};

const categoryColors = {
  pipeline: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  lender: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  performance: 'bg-green-500/10 text-green-600 dark:text-green-400',
  financial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

export default function Reports() {
  const { deals } = useDealsContext();
  const [selectedPeriod, setSelectedPeriod] = useState('last-30-days');
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const getPeriodDates = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'last-7-days':
        return { start: subDays(now, 7), end: now };
      case 'last-30-days':
        return { start: subDays(now, 30), end: now };
      case 'last-90-days':
        return { start: subDays(now, 90), end: now };
      case 'this-month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last-month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'last-6-months':
        return { start: subMonths(now, 6), end: now };
      case 'year-to-date':
        return { start: new Date(now.getFullYear(), 0, 1), end: now };
      default:
        return { start: subDays(now, 30), end: now };
    }
  };

  const handleGenerateReport = async (reportId: string, formatType: 'pdf' | 'csv' | 'xlsx') => {
    setGeneratingReport(`${reportId}-${formatType}`);
    
    const report = reportTypes.find(r => r.id === reportId);
    const { start, end } = getPeriodDates();
    
    try {
      const generator = reportGenerators[reportId];
      if (generator) {
        generator(deals, {
          title: report?.name || 'Report',
          dateRange: { start, end },
        }, formatType);
        
        toast({
          title: 'Report Downloaded',
          description: `${report?.name} (${formatType.toUpperCase()}) for ${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')} has been downloaded.`,
        });
      } else {
        throw new Error('Report generator not found');
      }
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to generate report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingReport(null);
    }
  };

  const filteredReports = selectedCategory === 'all' 
    ? reportTypes 
    : reportTypes.filter(r => r.category === selectedCategory);

  const groupedReports = filteredReports.reduce((acc, report) => {
    if (!acc[report.category]) {
      acc[report.category] = [];
    }
    acc[report.category].push(report);
    return acc;
  }, {} as Record<string, ReportType[]>);

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'pdf':
        return <FileType className="h-3.5 w-3.5" />;
      case 'csv':
      case 'xlsx':
        return <FileSpreadsheet className="h-3.5 w-3.5" />;
      default:
        return <FileText className="h-3.5 w-3.5" />;
    }
  };

  return (
    <>
      <Helmet>
        <title>Reports - nAItive</title>
        <meta name="description" content="Generate and download pipeline, lender, and financial reports" />
      </Helmet>

      <div className="bg-background">
        <DealsHeader />

        <main className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  Reports
                </h1>
                <p className="text-muted-foreground">
                  Generate detailed reports for your pipeline, lenders, and financials
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Time Period</label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <Calendar className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last-7-days">Last 7 days</SelectItem>
                      <SelectItem value="last-30-days">Last 30 days</SelectItem>
                      <SelectItem value="last-90-days">Last 90 days</SelectItem>
                      <SelectItem value="this-month">This month</SelectItem>
                      <SelectItem value="last-month">Last month</SelectItem>
                      <SelectItem value="last-6-months">Last 6 months</SelectItem>
                      <SelectItem value="year-to-date">Year to date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reports</SelectItem>
                      <SelectItem value="pipeline">Pipeline Reports</SelectItem>
                      <SelectItem value="lender">Lender Reports</SelectItem>
                      <SelectItem value="performance">Performance Reports</SelectItem>
                      <SelectItem value="financial">Financial Reports</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{deals.length}</span> deals in selected period
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reports Grid */}
          <div className="space-y-8">
            {Object.entries(groupedReports).map(([category, reports]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold">{categoryLabels[category as keyof typeof categoryLabels]}</h2>
                  <Badge variant="secondary" className={categoryColors[category as keyof typeof categoryColors]}>
                    {reports.length} reports
                  </Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {reports.map((report) => {
                    const Icon = report.icon;
                    return (
                      <Card key={report.id} className="group hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${categoryColors[report.category]}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                          </div>
                          <CardTitle className="text-base mt-3">{report.name}</CardTitle>
                          <CardDescription className="text-sm">
                            {report.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Separator className="mb-4" />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground mr-auto">Export as:</span>
                            {report.formats.map((formatType) => (
                              <Button
                                key={formatType}
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                disabled={generatingReport === `${report.id}-${formatType}`}
                                onClick={() => handleGenerateReport(report.id, formatType)}
                              >
                                {generatingReport === `${report.id}-${formatType}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  getFormatIcon(formatType)
                                )}
                                {formatType.toUpperCase()}
                              </Button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Custom Report Builder */}
          <div className="mt-8">
            <CustomReportBuilder deals={deals} />
          </div>
        </main>
      </div>
    </>
  );
}
