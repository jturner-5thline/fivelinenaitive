import { useState, useMemo } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { 
  FileSpreadsheet, 
  FileType, 
  Download, 
  Eye, 
  X, 
  Plus,
  GripVertical,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Deal, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { format } from 'date-fns';
import { generateCSV } from '@/utils/reportGenerator';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FieldOption {
  id: string;
  label: string;
  category: 'basic' | 'financial' | 'lender' | 'dates';
  getValue: (deal: Deal) => string | number;
}

const availableFields: FieldOption[] = [
  // Basic fields
  { id: 'company', label: 'Company Name', category: 'basic', getValue: (d) => d.company },
  { id: 'stage', label: 'Stage', category: 'basic', getValue: (d) => STAGE_CONFIG[d.stage]?.label || d.stage },
  { id: 'status', label: 'Status', category: 'basic', getValue: (d) => STATUS_CONFIG[d.status]?.label || d.status },
  { id: 'engagementType', label: 'Engagement Type', category: 'basic', getValue: (d) => ENGAGEMENT_TYPE_CONFIG[d.engagementType]?.label || d.engagementType },
  { id: 'manager', label: 'Manager', category: 'basic', getValue: (d) => d.manager || 'N/A' },
  { id: 'referredBy', label: 'Referred By', category: 'basic', getValue: (d) => d.referredBy?.name || 'N/A' },
  
  // Financial fields
  { id: 'value', label: 'Deal Value', category: 'financial', getValue: (d) => d.value },
  { id: 'totalFee', label: 'Total Fee', category: 'financial', getValue: (d) => d.totalFee || 0 },
  { id: 'retainerFee', label: 'Retainer Fee', category: 'financial', getValue: (d) => d.retainerFee || 0 },
  { id: 'milestoneFee', label: 'Milestone Fee', category: 'financial', getValue: (d) => d.milestoneFee || 0 },
  { id: 'successFeePercent', label: 'Success Fee %', category: 'financial', getValue: (d) => d.successFeePercent || 0 },
  { id: 'preSigningHours', label: 'Pre-Signing Hours', category: 'financial', getValue: (d) => d.preSigningHours || 0 },
  { id: 'postSigningHours', label: 'Post-Signing Hours', category: 'financial', getValue: (d) => d.postSigningHours || 0 },
  
  // Lender fields
  { id: 'lenderCount', label: 'Total Lenders', category: 'lender', getValue: (d) => d.lenders?.length || 0 },
  { id: 'activeLenders', label: 'Active Lenders', category: 'lender', getValue: (d) => d.lenders?.filter(l => l.trackingStatus === 'active').length || 0 },
  { id: 'passedLenders', label: 'Passed Lenders', category: 'lender', getValue: (d) => d.lenders?.filter(l => l.trackingStatus === 'passed').length || 0 },
  
  // Date fields
  { id: 'createdAt', label: 'Created Date', category: 'dates', getValue: (d) => format(new Date(d.createdAt), 'yyyy-MM-dd') },
  { id: 'updatedAt', label: 'Last Updated', category: 'dates', getValue: (d) => format(new Date(d.updatedAt), 'yyyy-MM-dd') },
];

const categoryLabels = {
  basic: 'Basic Information',
  financial: 'Financial Data',
  lender: 'Lender Metrics',
  dates: 'Date Fields',
};

interface FilterConfig {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between';
  value: string;
  value2?: string;
}

interface CustomReportBuilderProps {
  deals: Deal[];
}

export function CustomReportBuilder({ deals }: CustomReportBuilderProps) {
  const { formatCurrencyValue } = usePreferences();
  const [selectedFields, setSelectedFields] = useState<string[]>(['company', 'stage', 'status', 'manager', 'value']);
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [reportName, setReportName] = useState('Custom Report');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [managerFilter, setManagerFilter] = useState<string>('all');

  // Get unique managers from deals
  const managers = useMemo(() => {
    const managerSet = new Set(deals.map(d => d.manager).filter(Boolean));
    return Array.from(managerSet) as string[];
  }, [deals]);

  // Apply filters to deals
  const filteredDeals = useMemo(() => {
    let result = [...deals];

    // Date filter
    if (dateFrom) {
      result = result.filter(d => new Date(d.createdAt) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(d => new Date(d.createdAt) <= dateTo);
    }

    // Stage filter
    if (stageFilter !== 'all') {
      result = result.filter(d => d.stage === stageFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    // Manager filter
    if (managerFilter !== 'all') {
      result = result.filter(d => d.manager === managerFilter);
    }

    return result;
  }, [deals, dateFrom, dateTo, stageFilter, statusFilter, managerFilter]);

  // Generate preview data
  const previewData = useMemo(() => {
    return filteredDeals.slice(0, 10).map(deal => {
      const row: Record<string, string | number> = {};
      selectedFields.forEach(fieldId => {
        const field = availableFields.find(f => f.id === fieldId);
        if (field) {
          row[field.label] = field.getValue(deal);
        }
      });
      return row;
    });
  }, [filteredDeals, selectedFields]);

  const toggleField = (fieldId: string) => {
    setSelectedFields(prev => 
      prev.includes(fieldId)
        ? prev.filter(f => f !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleExportCSV = () => {
    if (selectedFields.length === 0) {
      toast({ title: 'No fields selected', description: 'Please select at least one field to export.', variant: 'destructive' });
      return;
    }

    const exportData = filteredDeals.map(deal => {
      const row: Record<string, string | number> = {};
      selectedFields.forEach(fieldId => {
        const field = availableFields.find(f => f.id === fieldId);
        if (field) {
          row[field.label] = field.getValue(deal);
        }
      });
      return row;
    });

    const filename = `${reportName.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}`;
    generateCSV(exportData, filename);

    toast({
      title: 'Report Exported',
      description: `${reportName} exported as CSV with ${filteredDeals.length} rows.`,
    });
  };

  const handleExportPDF = () => {
    if (selectedFields.length === 0) {
      toast({ title: 'No fields selected', description: 'Please select at least one field to export.', variant: 'destructive' });
      return;
    }

    const doc = new jsPDF({ orientation: selectedFields.length > 6 ? 'landscape' : 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(reportName, 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, 14, 28);
    doc.text(`${filteredDeals.length} records`, pageWidth - 14, 28, { align: 'right' });

    // Filters applied
    const appliedFilters: string[] = [];
    if (dateFrom || dateTo) {
      appliedFilters.push(`Date: ${dateFrom ? format(dateFrom, 'MMM d') : 'Start'} - ${dateTo ? format(dateTo, 'MMM d, yyyy') : 'Now'}`);
    }
    if (stageFilter !== 'all') appliedFilters.push(`Stage: ${STAGE_CONFIG[stageFilter as keyof typeof STAGE_CONFIG]?.label}`);
    if (statusFilter !== 'all') appliedFilters.push(`Status: ${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG]?.label}`);
    if (managerFilter !== 'all') appliedFilters.push(`Manager: ${managerFilter}`);

    if (appliedFilters.length > 0) {
      doc.text(`Filters: ${appliedFilters.join(' | ')}`, 14, 34);
    }

    // Table
    const headers = selectedFields.map(fieldId => {
      const field = availableFields.find(f => f.id === fieldId);
      return field?.label || fieldId;
    });

    const rows = filteredDeals.map(deal => 
      selectedFields.map(fieldId => {
        const field = availableFields.find(f => f.id === fieldId);
        const value = field?.getValue(deal);
        if (typeof value === 'number' && (fieldId === 'value' || fieldId.includes('Fee'))) {
          return formatCurrencyValue(value);
        }
        return String(value ?? '');
      })
    );

    autoTable(doc, {
      startY: appliedFilters.length > 0 ? 40 : 34,
      head: [headers],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8 },
    });

    const filename = `${reportName.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(filename);

    toast({
      title: 'Report Exported',
      description: `${reportName} exported as PDF with ${filteredDeals.length} rows.`,
    });
  };

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setStageFilter('all');
    setStatusFilter('all');
    setManagerFilter('all');
  };

  const activeFilterCount = [
    dateFrom || dateTo,
    stageFilter !== 'all',
    statusFilter !== 'all',
    managerFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Custom Report Builder</CardTitle>
            <CardDescription>
              Select fields and apply filters to create a custom report
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Report Name */}
        <div className="space-y-2">
          <Label htmlFor="reportName">Report Name</Label>
          <Input
            id="reportName"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Enter report name"
            className="max-w-sm"
          />
        </div>

        <Separator />

        {/* Filters Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Filters</h3>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all ({activeFilterCount})
              </Button>
            )}
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, 'MMM d') : 'From'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, 'MMM d') : 'To'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Stage Filter */}
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manager Filter */}
            <div className="space-y-2">
              <Label>Manager</Label>
              <Select value={managerFilter} onValueChange={setManagerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All managers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Managers</SelectItem>
                  {managers.map((manager) => (
                    <SelectItem key={manager} value={manager}>{manager}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{filteredDeals.length}</span> deals match current filters
          </div>
        </div>

        <Separator />

        {/* Field Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Select Fields</h3>
            <Badge variant="secondary">{selectedFields.length} selected</Badge>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(categoryLabels).map(([category, label]) => (
              <div key={category} className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
                <div className="space-y-2">
                  {availableFields
                    .filter(f => f.category === category)
                    .map(field => (
                      <div key={field.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={field.id}
                          checked={selectedFields.includes(field.id)}
                          onCheckedChange={() => toggleField(field.id)}
                        />
                        <Label
                          htmlFor={field.id}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {field.label}
                        </Label>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={selectedFields.length === 0}>
                <Eye className="h-4 w-4" />
                Preview Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{reportName} - Preview</DialogTitle>
                <DialogDescription>
                  Showing first 10 of {filteredDeals.length} records
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedFields.map(fieldId => {
                        const field = availableFields.find(f => f.id === fieldId);
                        return (
                          <TableHead key={fieldId} className="whitespace-nowrap">
                            {field?.label}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row, idx) => (
                      <TableRow key={idx}>
                        {selectedFields.map((fieldId, cellIdx) => {
                          const value = row[availableFields.find(f => f.id === fieldId)?.label || ''];
                          const isMoneyField = fieldId === 'value' || fieldId.includes('Fee');
                          return (
                            <TableCell key={cellIdx} className="whitespace-nowrap">
                              {isMoneyField && typeof value === 'number'
                                ? formatCurrencyValue(value)
                                : String(value ?? '')}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" className="gap-2" onClick={handleExportCSV} disabled={selectedFields.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="gradient" className="gap-2" onClick={handleExportPDF} disabled={selectedFields.length === 0}>
              <FileType className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
