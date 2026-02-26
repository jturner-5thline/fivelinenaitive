import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Wand2, Clock, ExternalLink, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { useGamma } from '@/hooks/useGamma';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GammaFormatSelector } from './gamma/GammaFormatSelector';
import { GammaThemeGrid } from './gamma/GammaThemeGrid';
import { GammaGenerationProgress } from './gamma/GammaGenerationProgress';
import { GammaViewer } from './gamma/GammaViewer';
import { GammaDealPreview } from './gamma/GammaDealPreview';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface GammaIntegrationPanelProps {
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

export function GammaIntegrationPanel({ dealData }: GammaIntegrationPanelProps) {
  const { generate, fetchThemes, isGenerating, currentGeneration, themes, isLoadingThemes } = useGamma();
  const [format, setFormat] = useState<'presentation' | 'document'>('presentation');
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const [customPrompt, setCustomPrompt] = useState('');
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<Array<{
    url: string;
    pdfUrl?: string;
    pptxUrl?: string;
    createdAt: string;
    format: string;
  }>>([]);

  useEffect(() => { fetchThemes(); }, [fetchThemes]);

  useEffect(() => {
    if (currentGeneration?.status === 'completed' && currentGeneration.gammaUrl) {
      setGenerationHistory(prev => [{
        url: currentGeneration.gammaUrl!,
        pdfUrl: currentGeneration.pdfUrl,
        pptxUrl: currentGeneration.pptxUrl,
        createdAt: new Date().toISOString(),
        format,
      }, ...prev]);
    }
  }, [currentGeneration?.status, currentGeneration?.gammaUrl, format]);

  const buildDealPrompt = () => {
    let prompt = `Create a professional ${format} about the following deal:\n\n`;
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
    if (customPrompt) prompt += `\n**Additional Instructions:**\n${customPrompt}\n`;
    return prompt;
  };

  const handleGenerate = async () => {
    await generate(buildDealPrompt(), {
      format,
      themeId: selectedTheme !== 'default' ? selectedTheme : undefined,
    });
  };

  // Viewing mode
  if (viewingUrl) {
    const historyItem = generationHistory.find(h => h.url === viewingUrl);
    return (
      <div className="space-y-4">
        <GammaViewer
          url={viewingUrl}
          pdfUrl={historyItem?.pdfUrl}
          pptxUrl={historyItem?.pptxUrl}
          onClose={() => setViewingUrl(null)}
        />
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

      {/* Custom prompt */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Additional Instructions</p>
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

      {/* History */}
      {generationHistory.length > 1 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Previous Generations</p>
          <ScrollArea className="max-h-[180px]">
            <div className="space-y-1.5">
              {generationHistory.slice(1).map((gen, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <span className="text-sm capitalize text-foreground">{gen.format}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(gen.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => setViewingUrl(gen.url)}>
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" asChild>
                      <a href={gen.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" /> Open
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
