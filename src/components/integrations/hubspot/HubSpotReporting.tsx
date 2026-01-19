import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { 
  useHubSpotDeals, 
  useHubSpotContacts, 
  useHubSpotCompanies,
  useHubSpotPipelines,
  useHubSpotOwners,
  useHubSpotAnalyticsSummary
} from "@/hooks/useHubSpot";
import { 
  FileText, 
  Download, 
  BarChart3,
  PieChart,
  Users,
  Building2,
  Handshake,
  Calendar,
  Filter,
  Loader2,
  FileSpreadsheet,
  FileDown
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";

type ReportType = 'pipeline' | 'deals' | 'contacts' | 'companies' | 'owner-performance' | 'custom';
type ExportFormat = 'csv' | 'pdf';
type DateRange = 'last-7' | 'last-30' | 'last-90' | 'this-month' | 'last-month' | 'all';

const REPORT_TYPES = [
  { id: 'pipeline', name: 'Pipeline Summary', icon: BarChart3, description: 'Deal distribution by stage' },
  { id: 'deals', name: 'Deals Report', icon: Handshake, description: 'All deals with details' },
  { id: 'contacts', name: 'Contacts Report', icon: Users, description: 'Contact list with info' },
  { id: 'companies', name: 'Companies Report', icon: Building2, description: 'Company directory' },
  { id: 'owner-performance', name: 'Owner Performance', icon: PieChart, description: 'Deals by owner' },
];

export function HubSpotReporting() {
  const { data: dealsData, isLoading: dealsLoading } = useHubSpotDeals();
  const { data: contactsData, isLoading: contactsLoading } = useHubSpotContacts();
  const { data: companiesData, isLoading: companiesLoading } = useHubSpotCompanies();
  const { data: pipelinesData } = useHubSpotPipelines();
  const { data: ownersData } = useHubSpotOwners();
  const { data: analyticsData } = useHubSpotAnalyticsSummary();

  const [selectedReport, setSelectedReport] = useState<ReportType>('pipeline');
  const [dateRange, setDateRange] = useState<DateRange>('last-30');
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  // Custom report fields
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(['dealname', 'amount', 'dealstage', 'createdate']));

  const dateRangeFilter = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case 'last-7':
        return { start: subDays(now, 7), end: now };
      case 'last-30':
        return { start: subDays(now, 30), end: now };
      case 'last-90':
        return { start: subDays(now, 90), end: now };
      case 'this-month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last-month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'all':
      default:
        return null;
    }
  }, [dateRange]);

  // Filter data by date range
  const filteredDeals = useMemo(() => {
    if (!dealsData?.results) return [];
    if (!dateRangeFilter) return dealsData.results;
    
    return dealsData.results.filter(deal => {
      const createDate = deal.properties.createdate ? new Date(deal.properties.createdate) : null;
      if (!createDate) return true;
      return createDate >= dateRangeFilter.start && createDate <= dateRangeFilter.end;
    });
  }, [dealsData, dateRangeFilter]);

  // Pipeline summary data
  const pipelineSummary = useMemo(() => {
    if (!pipelinesData?.results) return [];
    
    const stageCounts: Record<string, { stage: string; count: number; value: number }> = {};
    
    filteredDeals.forEach(deal => {
      const stageId = deal.properties.dealstage;
      if (!stageId) return;
      
      let stageName = stageId;
      for (const pipeline of pipelinesData.results) {
        const stage = pipeline.stages.find(s => s.id === stageId);
        if (stage) {
          stageName = stage.label;
          break;
        }
      }
      
      if (!stageCounts[stageId]) {
        stageCounts[stageId] = { stage: stageName, count: 0, value: 0 };
      }
      stageCounts[stageId].count++;
      stageCounts[stageId].value += parseFloat(deal.properties.amount || '0');
    });
    
    return Object.values(stageCounts);
  }, [filteredDeals, pipelinesData]);

  // Owner performance data
  const ownerPerformance = useMemo(() => {
    const ownerStats: Record<string, { name: string; deals: number; value: number; won: number }> = {};
    
    filteredDeals.forEach(deal => {
      const ownerId = deal.properties.hubspot_owner_id;
      if (!ownerId) return;
      
      const owner = ownersData?.results?.find(o => o.id === ownerId);
      const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : 'Unassigned';
      
      if (!ownerStats[ownerId]) {
        ownerStats[ownerId] = { name: ownerName, deals: 0, value: 0, won: 0 };
      }
      ownerStats[ownerId].deals++;
      ownerStats[ownerId].value += parseFloat(deal.properties.amount || '0');
      if (deal.properties.hs_is_closed_won === 'true') {
        ownerStats[ownerId].won++;
      }
    });
    
    return Object.values(ownerStats).sort((a, b) => b.value - a.value);
  }, [filteredDeals, ownersData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", { 
      style: "currency", 
      currency: "USD", 
      maximumFractionDigits: 0 
    }).format(value);
  };

  const toggleField = (field: string) => {
    const newFields = new Set(selectedFields);
    if (newFields.has(field)) {
      newFields.delete(field);
    } else {
      newFields.add(field);
    }
    setSelectedFields(newFields);
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      let data: any[] = [];
      let filename = '';
      
      switch (selectedReport) {
        case 'pipeline':
          data = pipelineSummary.map(s => ({
            Stage: s.stage,
            'Deal Count': s.count,
            'Total Value': formatCurrency(s.value),
          }));
          filename = `hubspot-pipeline-${format(new Date(), 'yyyy-MM-dd')}`;
          break;
          
        case 'deals':
          data = filteredDeals.map(d => ({
            'Deal Name': d.properties.dealname || '',
            Amount: d.properties.amount ? formatCurrency(parseFloat(d.properties.amount)) : '',
            Stage: d.properties.dealstage || '',
            'Close Date': d.properties.closedate ? format(new Date(d.properties.closedate), 'MM/dd/yyyy') : '',
            'Created': d.properties.createdate ? format(new Date(d.properties.createdate), 'MM/dd/yyyy') : '',
            'Closed Won': d.properties.hs_is_closed_won === 'true' ? 'Yes' : 'No',
          }));
          filename = `hubspot-deals-${format(new Date(), 'yyyy-MM-dd')}`;
          break;
          
        case 'contacts':
          data = (contactsData?.results || []).map(c => ({
            'Email': c.properties.email || '',
            'First Name': c.properties.firstname || '',
            'Last Name': c.properties.lastname || '',
            'Company': c.properties.company || '',
            'Job Title': c.properties.jobtitle || '',
            'Phone': c.properties.phone || '',
          }));
          filename = `hubspot-contacts-${format(new Date(), 'yyyy-MM-dd')}`;
          break;
          
        case 'companies':
          data = (companiesData?.results || []).map(c => ({
            'Name': c.properties.name || '',
            'Domain': c.properties.domain || '',
            'Industry': c.properties.industry || '',
            'Employees': c.properties.numberofemployees || '',
            'Revenue': c.properties.annualrevenue || '',
            'City': c.properties.city || '',
            'Country': c.properties.country || '',
          }));
          filename = `hubspot-companies-${format(new Date(), 'yyyy-MM-dd')}`;
          break;
          
        case 'owner-performance':
          data = ownerPerformance.map(o => ({
            'Owner': o.name,
            'Total Deals': o.deals,
            'Total Value': formatCurrency(o.value),
            'Won Deals': o.won,
            'Win Rate': o.deals > 0 ? `${Math.round((o.won / o.deals) * 100)}%` : '0%',
          }));
          filename = `hubspot-owner-performance-${format(new Date(), 'yyyy-MM-dd')}`;
          break;
      }

      if (exportFormat === 'csv') {
        // Generate CSV
        if (data.length === 0) {
          toast.error('No data to export');
          return;
        }
        
        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        
        toast.success('Report exported successfully');
      } else {
        // PDF export (simplified - would use jspdf in real implementation)
        toast.info('PDF export coming soon - CSV exported instead');
        // Fallback to CSV for now
        const headers = Object.keys(data[0] || {});
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report');
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = dealsLoading || contactsLoading || companiesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Report Type Selection */}
      <div className="grid gap-4 md:grid-cols-5">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const isSelected = selectedReport === report.id;
          
          return (
            <Card 
              key={report.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${
                isSelected ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => setSelectedReport(report.id as ReportType)}
            >
              <CardContent className="pt-4">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={`p-3 rounded-lg ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <p className="font-medium text-sm">{report.name}</p>
                  <p className="text-xs text-muted-foreground">{report.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters & Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {REPORT_TYPES.find(r => r.id === selectedReport)?.name}
              </CardTitle>
              <CardDescription>
                {filteredDeals.length} records • {dateRange === 'all' ? 'All time' : `Last ${dateRange.split('-')[1]} days`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="w-40">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-7">Last 7 days</SelectItem>
                  <SelectItem value="last-30">Last 30 days</SelectItem>
                  <SelectItem value="last-90">Last 90 days</SelectItem>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="last-month">Last month</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>

              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      CSV
                    </div>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileDown className="h-4 w-4" />
                      PDF
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={handleExport} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {selectedReport === 'pipeline' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Deal Count</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Avg. Deal Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelineSummary.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.stage}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.value)}</TableCell>
                      <TableCell className="text-right">
                        {row.count > 0 ? formatCurrency(row.value / row.count) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {pipelineSummary.reduce((sum, r) => sum + r.count, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(pipelineSummary.reduce((sum, r) => sum + r.value, 0))}
                    </TableCell>
                    <TableCell className="text-right">-</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}

            {selectedReport === 'deals' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal Name</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Close Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">{deal.properties.dealname}</TableCell>
                      <TableCell className="text-right">
                        {deal.properties.amount ? formatCurrency(parseFloat(deal.properties.amount)) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{deal.properties.dealstage}</Badge>
                      </TableCell>
                      <TableCell>
                        {deal.properties.closedate 
                          ? format(new Date(deal.properties.closedate), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {deal.properties.hs_is_closed_won === 'true' ? (
                          <Badge className="bg-green-500/10 text-green-600">Won</Badge>
                        ) : deal.properties.hs_is_closed === 'true' ? (
                          <Badge variant="secondary">Closed</Badge>
                        ) : (
                          <Badge variant="outline">Open</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {selectedReport === 'contacts' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactsData?.results?.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {[contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || '-'}
                      </TableCell>
                      <TableCell>{contact.properties.email || '-'}</TableCell>
                      <TableCell>{contact.properties.company || '-'}</TableCell>
                      <TableCell>{contact.properties.jobtitle || '-'}</TableCell>
                      <TableCell>{contact.properties.phone || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {selectedReport === 'companies' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companiesData?.results?.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.properties.name || '-'}</TableCell>
                      <TableCell>{company.properties.domain || '-'}</TableCell>
                      <TableCell>{company.properties.industry || '-'}</TableCell>
                      <TableCell>{company.properties.numberofemployees || '-'}</TableCell>
                      <TableCell>
                        {[company.properties.city, company.properties.country].filter(Boolean).join(', ') || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {selectedReport === 'owner-performance' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Total Deals</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Won Deals</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownerPerformance.map((owner, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{owner.name}</TableCell>
                      <TableCell className="text-right">{owner.deals}</TableCell>
                      <TableCell className="text-right">{formatCurrency(owner.value)}</TableCell>
                      <TableCell className="text-right">{owner.won}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={owner.deals > 0 && (owner.won / owner.deals) >= 0.5 ? 'default' : 'secondary'}>
                          {owner.deals > 0 ? `${Math.round((owner.won / owner.deals) * 100)}%` : '0%'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}