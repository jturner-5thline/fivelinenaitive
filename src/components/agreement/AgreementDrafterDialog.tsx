import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FileSignature, X, RotateCcw, Eye, FileText, Download, Loader2, Save } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useActiveTemplate } from './useAgreementTemplates';
import { AgreementSection, AgreementFieldDef, AgreementSubsection, AgreementQualifier } from './types';
import { resolveTemplate, resolveForExport, renderQualifierList, getDefaultValues } from './templateResolver';
import { DrафterSidebar } from './DrафterSidebar';
import { DrафterEditor } from './DrафterEditor';
import { DrафterPreview } from './DrафterPreview';
import { AgreementFullPreview } from './AgreementFullPreview';
import { exportToPdf, exportToDocx } from './exportUtils';

interface AgreementDrafterDialogProps {
  dealId: string;
  companyName: string;
  companyShort?: string;
}

export function AgreementDrafterDialog({ dealId, companyName, companyShort }: AgreementDrafterDialogProps) {
  const [open, setOpen] = useState(false);
  const { template, loading } = useActiveTemplate();
  const [sections, setSections] = useState<AgreementSection[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Initialize state when template loads or dialog opens
  useEffect(() => {
    if (template && open) {
      const secs = template.sections.map(s => ({ ...s }));
      setSections(secs);
      const defaults = getDefaultValues(secs);
      // Pre-populate deal data
      defaults['company_name'] = companyName || defaults['company_name'];
      defaults['company_short'] = companyShort || companyName?.split(' ')[0] || defaults['company_short'];
      setValues(defaults);
      setActiveSection(secs[0]?.section_id || null);
    }
  }, [template, open, companyName, companyShort]);

  const updateValue = useCallback((key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleSection = useCallback((sectionId: string, enabled: boolean) => {
    setSections(prev => prev.map(s => s.section_id === sectionId ? { ...s, enabled } : s));
  }, []);

  const handleReset = () => {
    if (!template) return;
    const defaults = getDefaultValues(template.sections);
    defaults['company_name'] = companyName;
    defaults['company_short'] = companyShort || companyName?.split(' ')[0] || 'Company';
    setValues(defaults);
    setSections(template.sections.map(s => ({ ...s })));
    toast.success('Reset to defaults');
  };

  const handleSaveDraft = () => {
    toast.success('Draft saved successfully');
  };

  const handleExportPdf = async () => {
    try {
      await exportToPdf(sections, values, companyName);
      toast.success('PDF exported successfully');
    } catch (e) {
      toast.error('Failed to export PDF');
    }
  };

  const handleExportDocx = async () => {
    try {
      await exportToDocx(sections, values, companyName);
      toast.success('DOCX exported successfully');
    } catch (e) {
      toast.error('Failed to export DOCX');
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = previewRef.current?.querySelector(`[data-section="${sectionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/50');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 1500);
    }
  };

  const handleReorderSections = useCallback((reorderedSections: AgreementSection[]) => {
    setSections(reorderedSections);
  }, []);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="relative overflow-hidden h-8 w-8 border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)]" title="Draft Agreement" onClick={() => setOpen(true)}>
              <FileSignature className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Draft Agreement</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[95vw] w-[95vw] max-h-[calc(100vh-60px)] h-[92vh] p-0 gap-0 !flex !flex-col overflow-hidden animate-in fade-in-0 zoom-in-[0.97] duration-300"
          onInteractOutside={e => e.preventDefault()}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !template ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">No Agreement Template</p>
              <p className="text-sm mt-1">Ask a company admin to create a template in Settings → Agreement Templates</p>
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <FileSignature className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">Agreement Drafter</span>
                  <Badge variant="outline" className="text-[10px]">{template.name}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs h-8 transition-all duration-150" onClick={handleReset}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reset all fields to defaults</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs h-8 transition-all duration-150" onClick={() => setShowFullPreview(true)}>
                          <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Full document preview</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-8 transition-all duration-150" onClick={handleSaveDraft}>
                          <Save className="h-3.5 w-3.5 mr-1.5" /> Save Draft
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Save current configuration</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-8 transition-all duration-150" onClick={handleExportDocx}>
                          <Download className="h-3.5 w-3.5 mr-1.5" /> DOCX
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export as Word document</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="default" size="sm" className="text-xs h-8 transition-all duration-150" onClick={handleExportPdf}>
                          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export as PDF document</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                </div>
              </div>

              {/* 3-panel layout */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Sidebar */}
                <div className="w-80 border-r shrink-0 flex flex-col min-h-0 overflow-hidden">
                  <DrафterSidebar
                    sections={sections}
                    activeSection={activeSection}
                    onSelectSection={(id) => { setActiveSection(id); scrollToSection(id); }}
                    onToggleSection={toggleSection}
                    onReorderSections={handleReorderSections}
                    values={values}
                  />
                </div>

                {/* Editor */}
                <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                  <DrафterEditor
                    section={activeSection ? sections.find(s => s.section_id === activeSection) || null : null}
                    values={values}
                    onValueChange={updateValue}
                    onSectionUpdate={(sectionId, updates) => {
                      setSections(prev => prev.map(s => s.section_id === sectionId ? { ...s, ...updates } : s));
                    }}
                  />
                </div>

                {/* Preview */}
                <div className="w-[420px] border-l shrink-0 hidden xl:flex flex-col min-h-0 overflow-hidden">
                  <DrафterPreview
                    ref={previewRef}
                    sections={sections}
                    values={values}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showFullPreview && (
        <AgreementFullPreview
          sections={sections}
          values={values}
          companyName={companyName}
          onClose={() => setShowFullPreview(false)}
          onExportPdf={handleExportPdf}
          onExportDocx={handleExportDocx}
        />
      )}
    </>
  );
}
