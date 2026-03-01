import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Download, Presentation, Sparkles, Check, Loader2,
  BarChart3, TrendingUp, DollarSign, PieChart, Table2,
  Calendar, Users, CheckSquare, ChevronRight, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ReportSection {
  id: string;
  label: string;
  icon: React.ElementType;
  included: boolean;
  aiNarrative: boolean;
}

const DEFAULT_SECTIONS: ReportSection[] = [
  { id: 'exec_summary', label: 'Executive Summary', icon: FileText, included: true, aiNarrative: true },
  { id: 'kpis', label: 'KPI Scorecard', icon: TrendingUp, included: true, aiNarrative: false },
  { id: 'pnl', label: 'P&L Statement', icon: Table2, included: true, aiNarrative: true },
  { id: 'revenue', label: 'Revenue Analysis', icon: BarChart3, included: true, aiNarrative: true },
  { id: 'expenses', label: 'Expense Breakdown', icon: PieChart, included: true, aiNarrative: false },
  { id: 'cashflow', label: 'Cash Flow & Runway', icon: DollarSign, included: true, aiNarrative: true },
  { id: 'scenarios', label: 'Scenario Comparison', icon: TrendingUp, included: false, aiNarrative: false },
  { id: 'headcount', label: 'Headcount & Hiring', icon: Users, included: false, aiNarrative: false },
  { id: 'milestones', label: 'Key Milestones', icon: CheckSquare, included: false, aiNarrative: false },
];

const TEMPLATES = [
  { id: 'monthly', label: 'Monthly Board Pack', pages: '8-12', desc: 'Standard monthly financial review' },
  { id: 'quarterly', label: 'Quarterly Review', pages: '15-20', desc: 'Detailed quarterly deep-dive' },
  { id: 'investor', label: 'Investor Update', pages: '5-8', desc: 'Concise investor-facing summary' },
  { id: 'custom', label: 'Custom Report', pages: 'Variable', desc: 'Build your own layout' },
];

export function BoardReportExport() {
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [format, setFormat] = useState<'pdf' | 'pptx'>('pdf');
  const [template, setTemplate] = useState('monthly');
  const [period, setPeriod] = useState('jan-2025');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(false);

  const includedCount = sections.filter(s => s.included).length;
  const aiCount = sections.filter(s => s.included && s.aiNarrative).length;

  const toggleSection = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, included: !s.included } : s));
  };

  const toggleAI = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, aiNarrative: !s.aiNarrative } : s));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    // Simulate generation
    await new Promise(r => setTimeout(r, 3000));
    setGenerating(false);
    toast.success(`Board report generated as ${format.toUpperCase()}`, {
      description: `${includedCount} sections with ${aiCount} AI narratives`,
      action: { label: 'Download', onClick: () => toast.info('Download started') },
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Left: Configuration */}
      <div className="xl:col-span-2 space-y-4">
        {/* Template Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Report Template
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    template === t.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
                  <Badge variant="outline" className="text-[9px] mt-2">{t.pages} pages</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section Selector */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Report Sections</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{includedCount} sections</Badge>
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> {aiCount} AI narratives
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-80">
              <div className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div
                      key={section.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg transition-colors",
                        section.included ? "bg-muted/30" : "opacity-60"
                      )}
                    >
                      <Switch
                        checked={section.included}
                        onCheckedChange={() => toggleSection(section.id)}
                        className="scale-75"
                      />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium flex-1">{section.label}</span>
                      {section.included && (
                        <Button
                          variant={section.aiNarrative ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-[9px] gap-1 px-2"
                          onClick={() => toggleAI(section.id)}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          {section.aiNarrative ? 'AI On' : 'AI Off'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right: Settings & Generate */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Export Settings</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-muted-foreground">Period</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jan-2025">January 2025</SelectItem>
                  <SelectItem value="dec-2024">December 2024</SelectItem>
                  <SelectItem value="q4-2024">Q4 2024</SelectItem>
                  <SelectItem value="2024">Full Year 2024</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-medium text-muted-foreground">Format</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFormat('pdf')}
                  className={cn(
                    "p-3 rounded-lg border text-center transition-all",
                    format === 'pdf' ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <FileText className="h-5 w-5 mx-auto mb-1 text-destructive" />
                  <p className="text-xs font-medium">PDF</p>
                </button>
                <button
                  onClick={() => setFormat('pptx')}
                  className={cn(
                    "p-3 rounded-lg border text-center transition-all",
                    format === 'pptx' ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <Presentation className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-xs font-medium">PPTX</p>
                </button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Include cover page</span>
                <Switch defaultChecked className="scale-75" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Add appendix</span>
                <Switch className="scale-75" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Confidential watermark</span>
                <Switch defaultChecked className="scale-75" />
              </div>
            </div>

            <Separator />

            <Button
              className="w-full gap-2"
              onClick={handleGenerate}
              disabled={generating || includedCount === 0}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Generate {format.toUpperCase()}
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full gap-2 text-xs"
              onClick={() => setPreview(!preview)}
            >
              <Eye className="h-3.5 w-3.5" />
              {preview ? 'Hide Preview' : 'Preview Report'}
            </Button>
          </CardContent>
        </Card>

        {/* Quick Preview */}
        {preview && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Report Preview</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {sections.filter(s => s.included).map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-[10px] py-1">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="flex-1">{s.label}</span>
                      {s.aiNarrative && (
                        <Sparkles className="h-2.5 w-2.5 text-primary" />
                      )}
                    </div>
                  );
                })}
              </div>
              <Separator className="my-2" />
              <p className="text-[9px] text-muted-foreground text-center">
                Est. {includedCount * 2}-{includedCount * 3} pages
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
