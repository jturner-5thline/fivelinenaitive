import { useState, useCallback } from 'react';
import {
  FileText, Plus, Trash2, Download, ChevronDown, ChevronRight,
  FileDown, Sparkles, Loader2, Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { FinancialMetric, DetectedStatement } from '../types';
import { ReportCollaboration } from './ReportCollaboration';

interface ReportSection {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'metrics' | 'chart' | 'table';
  collapsed: boolean;
  isGenerating?: boolean;
}

interface ReportEditorProps {
  dealId: string;
  dealName?: string;
  dealStage?: string;
  dealValue?: number;
  metrics: FinancialMetric[];
  statements: DetectedStatement[];
  className?: string;
}

const DEFAULT_SECTIONS: ReportSection[] = [
  { id: 'exec', title: 'Executive Summary', content: '', type: 'text', collapsed: false },
  { id: 'biz', title: 'Business Overview', content: '', type: 'text', collapsed: true },
  { id: 'fin', title: 'Financial Analysis', content: '', type: 'text', collapsed: true },
  { id: 'rev', title: 'Revenue & Growth', content: '', type: 'text', collapsed: true },
  { id: 'margins', title: 'Margins & Profitability', content: '', type: 'text', collapsed: true },
  { id: 'leverage', title: 'Leverage & Coverage', content: '', type: 'text', collapsed: true },
  { id: 'wc', title: 'Working Capital', content: '', type: 'text', collapsed: true },
  { id: 'risks', title: 'Key Risks & Hurdles', content: '', type: 'text', collapsed: true },
  { id: 'covenants', title: 'Covenants', content: '', type: 'text', collapsed: true },
  { id: 'rec', title: 'Recommendation', content: '', type: 'text', collapsed: true },
];

export function ReportEditor({ dealId, dealName, dealStage, dealValue, metrics, statements, className }: ReportEditorProps) {
  const [sections, setSections] = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [activeSection, setActiveSection] = useState<string | null>('exec');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const updateSection = useCallback((id: string, updates: Partial<ReportSection>) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const addSection = useCallback(() => {
    const newSection: ReportSection = {
      id: crypto.randomUUID(),
      title: 'New Section',
      content: '',
      type: 'text',
      collapsed: false,
    };
    setSections(prev => [...prev, newSection]);
    setActiveSection(newSection.id);
    toast.success('Section added');
  }, []);

  const removeSection = useCallback((id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));
    if (activeSection === id) setActiveSection(null);
    toast.success('Section removed');
  }, [activeSection]);

  const toggleCollapse = useCallback((id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s));
  }, []);

  const metricsContext = metrics.map(m => `${m.label}: ${m.formatted}${m.trend ? ` (${m.trend})` : ''}`).join('\n');

  const generateSection = useCallback(async (sectionId: string, sectionTitle: string) => {
    updateSection(sectionId, { isGenerating: true, collapsed: false });
    try {
      const { data, error } = await supabase.functions.invoke('deal-diligence-ai', {
        body: { dealId, action: 'generate_section', sectionTitle, sectionId, metricsContext },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      updateSection(sectionId, { content: data?.content || '', isGenerating: false });
      toast.success(`Generated: ${sectionTitle}`);
    } catch (err) {
      console.error('Section generation error:', err);
      updateSection(sectionId, { isGenerating: false });
      toast.error(`Failed to generate ${sectionTitle}`);
    }
  }, [dealId, metricsContext, updateSection]);

  const generateAllSections = useCallback(async () => {
    setIsGeneratingAll(true);
    const emptySections = sections.filter(s => !s.content.trim());
    for (const section of emptySections) {
      await generateSection(section.id, section.title);
    }
    setIsGeneratingAll(false);
    toast.success('All sections generated');
  }, [sections, generateSection]);

  // Add content from chat "Add to report"
  const addToReport = useCallback((content: string, sectionId?: string) => {
    const targetId = sectionId || activeSection || sections[0]?.id;
    if (!targetId) return;
    setSections(prev => prev.map(s =>
      s.id === targetId
        ? { ...s, content: s.content ? `${s.content}\n\n${content}` : content }
        : s
    ));
    toast.success('Added to report');
  }, [activeSection, sections]);

  const exportToPDF = useCallback(() => {
    try {
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(20);
      doc.text(`${dealName || 'Deal'} — Screening Memo`, 20, y);
      y += 10;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${dealStage || 'Screening'} • ${dealValue ? `$${(dealValue / 1e6).toFixed(1)}MM` : 'TBD'} • ${new Date().toLocaleDateString()}`, 20, y);
      y += 5;
      doc.text('Confidential', 20, y);
      y += 10;
      doc.setTextColor(0);

      for (const section of sections) {
        if (!section.content.trim()) continue;
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.text(section.title, 20, y);
        y += 8;
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(section.content, 170);
        for (const line of lines) {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(line, 20, y);
          y += 5;
        }
        y += 8;
      }

      if (metrics.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.text('Financial Metrics Summary', 20, 20);
        autoTable(doc, {
          startY: 30,
          head: [['Metric', 'Value', 'Trend']],
          body: metrics.map(m => [m.label, m.formatted, m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '—']),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [68, 114, 196] },
        });
      }

      doc.save(`${(dealName || 'Deal').replace(/\s+/g, '_')}_Memo_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF exported successfully');
    } catch {
      toast.error('Failed to export PDF');
    }
  }, [sections, metrics, dealName, dealStage, dealValue]);

  const exportToDocx = useCallback(async () => {
    try {
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
      const children: any[] = [
        new Paragraph({ text: `${dealName || 'Deal'} — Screening Memo`, heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: `${dealStage || 'Screening'} • ${dealValue ? `$${(dealValue / 1e6).toFixed(1)}MM` : 'TBD'} • ${new Date().toLocaleDateString()}`, italics: true, size: 20 })] }),
        new Paragraph({ text: '' }),
      ];
      for (const section of sections) {
        children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
        if (section.content.trim()) {
          for (const para of section.content.split('\n\n')) {
            children.push(new Paragraph({ text: para.trim(), spacing: { after: 120 } }));
          }
        } else {
          children.push(new Paragraph({ children: [new TextRun({ text: '[To be completed]', italics: true, color: '999999' })] }));
        }
        children.push(new Paragraph({ text: '' }));
      }
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      const { saveAs } = await import('file-saver');
      saveAs(blob, `${(dealName || 'Deal').replace(/\s+/g, '_')}_Memo_${new Date().toISOString().split('T')[0]}.docx`);
      toast.success('Word document exported successfully');
    } catch {
      toast.error('Failed to export Word document');
    }
  }, [sections, dealName, dealStage, dealValue]);

  const filledCount = sections.filter(s => s.content.trim()).length;

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4", className)}>
      {/* Sidebar */}
      <div className="rounded-xl border border-border/30 p-4 h-fit sticky top-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Report Outline</h4>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addSection}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{filledCount}/{sections.length} sections</span>
            <span>{Math.round((filledCount / sections.length) * 100)}%</span>
          </div>
          <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(filledCount / sections.length) * 100}%` }} />
          </div>
        </div>

        <nav className="space-y-0.5">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => { setActiveSection(section.id); updateSection(section.id, { collapsed: false }); }}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/40 transition-colors flex items-center gap-1.5",
                activeSection === section.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {section.isGenerating ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin flex-shrink-0" />
              ) : section.content.trim() ? (
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
              )}
              {section.title}
            </button>
          ))}
        </nav>

        <Separator className="my-3" />

        {/* AI Generate All */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 gap-1.5 mb-2"
          onClick={generateAllSections}
          disabled={isGeneratingAll}
        >
          {isGeneratingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {isGeneratingAll ? 'Generating…' : 'AI Auto-fill All'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full text-xs h-8 gap-1.5">
              <Download className="h-3 w-3" />
              Export
              <ChevronDown className="h-3 w-3 ml-auto" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={exportToPDF} className="text-xs gap-2">
              <FileDown className="h-3.5 w-3.5" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportToDocx} className="text-xs gap-2">
              <FileText className="h-3.5 w-3.5" />
              Export as Word (.docx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-border/30 p-6 min-h-[600px]">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-serif font-bold mb-1">
            {dealName || 'Deal'} — Screening Memo
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {dealStage || 'Screening'} • {dealValue ? `$${(dealValue / 1e6).toFixed(1)}MM` : 'TBD'}
          </p>
          <Separator className="mb-6" />

          <div className="space-y-4">
            {sections.map(section => (
              <div key={section.id} className="group">
                <div className="flex items-center gap-2 cursor-pointer py-1" onClick={() => toggleCollapse(section.id)}>
                  {section.collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                  {section.isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}

                  <ReportCollaboration
                    dealId={dealId}
                    sectionId={section.id}
                    sectionTitle={section.title}
                  />

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={(e) => { e.stopPropagation(); generateSection(section.id, section.title); }}
                      disabled={section.isGenerating}
                    >
                      <Wand2 className="h-3 w-3" />
                      AI Fill
                    </Button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>

                {!section.collapsed && (
                  <div className="pl-6 mt-2">
                    <input
                      className="text-xs text-muted-foreground bg-transparent border-none outline-none w-full mb-2 placeholder:italic"
                      value={section.title}
                      onChange={e => updateSection(section.id, { title: e.target.value })}
                      placeholder="Section title"
                    />
                    <textarea
                      className="w-full min-h-[120px] text-sm leading-relaxed bg-transparent border border-border/20 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y placeholder:text-muted-foreground/40 placeholder:italic"
                      value={section.content}
                      onChange={e => updateSection(section.id, { content: e.target.value })}
                      placeholder="Write your analysis here, or click 'AI Fill' to auto-generate…"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
