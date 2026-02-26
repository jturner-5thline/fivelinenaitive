import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { useGamma } from '@/hooks/useGamma';
import { GammaFormatSelector } from './gamma/GammaFormatSelector';
import { GammaThemeGrid } from './gamma/GammaThemeGrid';
import { GammaGenerationProgress } from './gamma/GammaGenerationProgress';
import { GammaViewer } from './gamma/GammaViewer';
import { GammaDealPreview } from './gamma/GammaDealPreview';
import { GammaTemplateLibrary, GAMMA_TEMPLATES } from './gamma/GammaTemplateLibrary';
import { GammaCustomTemplates } from './gamma/GammaCustomTemplates';
import { GammaAIPromptBuilder } from './gamma/GammaAIPromptBuilder';
import { GammaHistoryPanel } from './gamma/GammaHistoryPanel';
import { GammaAutoGenerateSettings } from './gamma/GammaAutoGenerateSettings';
import { GammaCollaborationPanel } from './gamma/GammaCollaborationPanel';
import { GammaAnalyticsDashboard } from './gamma/GammaAnalyticsDashboard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { GammaTemplate } from './gamma/GammaTemplateLibrary';

interface GammaIntegrationPanelProps {
  dealId: string;
  dealData: {
    company: string;
    value?: number;
    stage?: string;
    status?: string;
    deal_type?: string;
    notes?: string;
    narrative?: string;
    lenders?: Array<{ name: string; stage: string }>;
    milestones?: Array<{ title: string; completed: boolean }>;
  };
}

export function GammaIntegrationPanel({ dealId, dealData }: GammaIntegrationPanelProps) {
  const { generate, fetchThemes, isGenerating, currentGeneration, themes, isLoadingThemes } = useGamma();
  const [format, setFormat] = useState<'presentation' | 'document'>('presentation');
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [viewingPdfUrl, setViewingPdfUrl] = useState<string | undefined>();
  const [viewingPptxUrl, setViewingPptxUrl] = useState<string | undefined>();
  const [showThemes, setShowThemes] = useState(false);
  const [showCustomTemplates, setShowCustomTemplates] = useState(false);
  const [showAutoGen, setShowAutoGen] = useState(false);
  const [showCollaboration, setShowCollaboration] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [selectedGenForCollab, setSelectedGenForCollab] = useState<string | null>(null);
  const [autoGenRules, setAutoGenRules] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`gamma-auto-rules-${dealId}`) || '[]');
    } catch { return []; }
  });

  useEffect(() => { fetchThemes(); }, [fetchThemes]);

  useEffect(() => {
    if (currentGeneration?.status === 'completed') {
      setHistoryRefreshKey(k => k + 1);
    }
  }, [currentGeneration?.status]);

  const handleTemplateSelect = (template: GammaTemplate) => {
    if (selectedTemplate === template.id) {
      setSelectedTemplate(null);
      setCustomPrompt('');
    } else {
      setSelectedTemplate(template.id);
      setFormat(template.suggestedFormat);
      setCustomPrompt(template.prompt);
    }
  };

  const buildDealPrompt = () => {
    let prompt = customPrompt || `Create a professional ${format} about the following deal:\n\n`;
    if (!customPrompt) {
      prompt += `**Company:** ${dealData.company}\n`;
      if (dealData.value) prompt += `**Deal Value:** $${(dealData.value / 1_000_000).toFixed(2)}M\n`;
      if (dealData.stage) prompt += `**Stage:** ${dealData.stage}\n`;
      if (dealData.status) prompt += `**Status:** ${dealData.status}\n`;
      if (dealData.deal_type) prompt += `**Deal Type:** ${dealData.deal_type}\n`;
      if (dealData.narrative) prompt += `\n**Deal Narrative:**\n${dealData.narrative}\n`;
      if (dealData.notes) prompt += `\n**Notes:**\n${dealData.notes}\n`;
      if (dealData.lenders?.length) {
        prompt += `\n**Lenders (${dealData.lenders.length}):**\n`;
        dealData.lenders.slice(0, 10).forEach(l => { prompt += `- ${l.name}: ${l.stage}\n`; });
      }
      if (dealData.milestones?.length) {
        prompt += `\n**Milestones:**\n`;
        dealData.milestones.forEach(m => { prompt += `- ${m.completed ? '✓' : '○'} ${m.title}\n`; });
      }
    } else {
      prompt += `\n\n---\nDeal Context:\n`;
      prompt += `Company: ${dealData.company}\n`;
      if (dealData.value) prompt += `Value: $${(dealData.value / 1_000_000).toFixed(2)}M\n`;
      if (dealData.stage) prompt += `Stage: ${dealData.stage}\n`;
      if (dealData.lenders?.length) prompt += `Lenders: ${dealData.lenders.length}\n`;
      if (dealData.milestones?.length) {
        const done = dealData.milestones.filter(m => m.completed).length;
        prompt += `Milestones: ${done}/${dealData.milestones.length} completed\n`;
      }
      if (dealData.narrative) prompt += `Narrative: ${dealData.narrative}\n`;
    }
    return prompt;
  };

  const handleGenerate = async () => {
    const templateLabel = selectedTemplate
      ? GAMMA_TEMPLATES.find(t => t.id === selectedTemplate)?.label || selectedTemplate.replace('custom-', '')
      : undefined;

    await generate(buildDealPrompt(), {
      format,
      themeId: selectedTheme !== 'default' ? selectedTheme : undefined,
      dealId,
      templateId: selectedTemplate || undefined,
      title: templateLabel || `${dealData.company} ${format}`,
    });
  };

  const handleViewHistory = (gen: any) => {
    setViewingUrl(gen.gamma_url);
    setViewingPdfUrl(gen.pdf_url);
    setViewingPptxUrl(gen.pptx_url);
    setSelectedGenForCollab(gen.id);
  };

  if (viewingUrl) {
    return (
      <div className="space-y-4">
        <GammaViewer
          url={viewingUrl}
          pdfUrl={viewingPdfUrl}
          pptxUrl={viewingPptxUrl}
          onClose={() => { setViewingUrl(null); setViewingPdfUrl(undefined); setViewingPptxUrl(undefined); setSelectedGenForCollab(null); }}
        />
        {selectedGenForCollab && (
          <GammaCollaborationPanel generationId={selectedGenForCollab} />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Hero */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-2">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Create with Gamma</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Transform your deal data into polished presentations and documents with AI
        </p>
      </div>

      {/* Deal data preview */}
      <GammaDealPreview dealData={dealData} />

      {/* Template Library */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Templates</p>
        <GammaTemplateLibrary selected={selectedTemplate} onSelect={handleTemplateSelect} />
      </div>

      {/* Custom Templates */}
      <Collapsible open={showCustomTemplates} onOpenChange={setShowCustomTemplates}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
            Custom Templates
            {showCustomTemplates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <GammaCustomTemplates selected={selectedTemplate} onSelect={handleTemplateSelect} />
        </CollapsibleContent>
      </Collapsible>

      {/* Format */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Format</p>
        <GammaFormatSelector value={format} onChange={setFormat} />
      </div>

      {/* Theme */}
      <Collapsible open={showThemes} onOpenChange={setShowThemes}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
            Theme
            {showThemes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {selectedTheme !== 'default' && (
              <span className="text-primary normal-case font-normal">
                • {themes.find(t => t.id === selectedTheme)?.name || 'Custom'}
              </span>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <GammaThemeGrid
            themes={themes}
            selected={selectedTheme}
            onChange={setSelectedTheme}
            isLoading={isLoadingThemes}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Custom prompt with AI builder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instructions</p>
          <GammaAIPromptBuilder dealData={dealData} format={format} onPromptGenerated={setCustomPrompt} />
        </div>
        <Textarea
          placeholder="e.g., Focus on lender engagement metrics, add a risk analysis section, emphasize key milestones..."
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          className="min-h-[80px] text-sm resize-none"
        />
      </div>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        size="lg"
        className="w-full gap-2 h-12 text-base font-semibold"
      >
        <Wand2 className="h-5 w-5" />
        Generate {format === 'presentation' ? 'Presentation' : 'Document'}
      </Button>

      {/* Generation progress */}
      {currentGeneration && currentGeneration.status !== 'completed' && (
        <GammaGenerationProgress status={currentGeneration.status} />
      )}

      {/* Completed result */}
      {currentGeneration?.status === 'completed' && currentGeneration.gammaUrl && (
        <GammaViewer
          url={currentGeneration.gammaUrl}
          pdfUrl={currentGeneration.pdfUrl}
          pptxUrl={currentGeneration.pptxUrl}
        />
      )}

      {/* Auto-Generate Rules */}
      <Collapsible open={showAutoGen} onOpenChange={setShowAutoGen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
            Automation
            {showAutoGen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {autoGenRules.length > 0 && (
              <span className="text-primary normal-case font-normal">• {autoGenRules.length} rule{autoGenRules.length > 1 ? 's' : ''}</span>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <GammaAutoGenerateSettings
            rules={autoGenRules}
            onRulesChange={(rules) => {
              setAutoGenRules(rules);
              localStorage.setItem(`gamma-auto-rules-${dealId}`, JSON.stringify(rules));
            }}
          />
        </CollapsibleContent>
      </Collapsible>




      {/* Analytics */}
      <Collapsible open={showAnalytics} onOpenChange={setShowAnalytics}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
            Analytics
            {showAnalytics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <GammaAnalyticsDashboard dealId={dealId} />
        </CollapsibleContent>
      </Collapsible>

      {/* Persistent History */}
      <GammaHistoryPanel dealId={dealId} onView={handleViewHistory} refreshKey={historyRefreshKey} />
    </div>
  );
}
