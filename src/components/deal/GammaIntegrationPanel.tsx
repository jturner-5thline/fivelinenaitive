import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Presentation, ExternalLink, Download, FileText, RefreshCw, Sparkles, Eye } from 'lucide-react';
import { useGamma } from '@/hooks/useGamma';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

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
  const [selectedTheme, setSelectedTheme] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [showEmbed, setShowEmbed] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<Array<{
    url: string;
    createdAt: string;
    format: string;
  }>>([]);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  // Track completed generations
  useEffect(() => {
    if (currentGeneration?.status === 'completed' && currentGeneration.gammaUrl) {
      setGenerationHistory(prev => [{
        url: currentGeneration.gammaUrl!,
        createdAt: new Date().toISOString(),
        format,
      }, ...prev]);
    }
  }, [currentGeneration?.status, currentGeneration?.gammaUrl, format]);

  const buildDealPrompt = () => {
    let prompt = `Create a professional ${format} about the following deal:\n\n`;
    prompt += `**Company:** ${dealData.company}\n`;
    if (dealData.value) prompt += `**Deal Value:** $${(dealData.value / 1000000).toFixed(2)}M\n`;
    if (dealData.stage) prompt += `**Stage:** ${dealData.stage}\n`;
    if (dealData.status) prompt += `**Status:** ${dealData.status}\n`;
    if (dealData.deal_type) prompt += `**Deal Type:** ${dealData.deal_type}\n`;
    
    if (dealData.narrative) {
      prompt += `\n**Deal Narrative:**\n${dealData.narrative}\n`;
    }
    
    if (dealData.notes) {
      prompt += `\n**Notes:**\n${dealData.notes}\n`;
    }

    if (dealData.lenders && dealData.lenders.length > 0) {
      prompt += `\n**Lenders (${dealData.lenders.length}):**\n`;
      dealData.lenders.slice(0, 10).forEach(l => {
        prompt += `- ${l.name}: ${l.stage}\n`;
      });
    }

    if (dealData.milestones && dealData.milestones.length > 0) {
      prompt += `\n**Milestones:**\n`;
      dealData.milestones.forEach(m => {
        prompt += `- ${m.completed ? '✓' : '○'} ${m.title}\n`;
      });
    }

    if (customPrompt) {
      prompt += `\n**Additional Instructions:**\n${customPrompt}\n`;
    }

    return prompt;
  };

  const handleGenerate = async () => {
    const inputText = buildDealPrompt();
    await generate(inputText, {
      format,
      themeId: selectedTheme || undefined,
    });
  };

  const handleEmbed = () => {
    if (embedUrl) {
      setShowEmbed(true);
    }
  };

  // Convert gamma.app URL to embed URL
  const getEmbedUrl = (url: string) => {
    // Gamma URLs: https://gamma.app/docs/XXXXX → embed format
    return url.includes('gamma.app') ? `${url}/embed` : url;
  };

  return (
    <div className="space-y-4">
      {/* Generate Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate with Gamma
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Format</label>
              <Select value={format} onValueChange={(v) => setFormat(v as 'presentation' | 'document')}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presentation">Presentation</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Theme</label>
              <Select value={selectedTheme} onValueChange={setSelectedTheme}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={isLoadingThemes ? 'Loading...' : 'Default'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default</SelectItem>
                  {themes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Additional Instructions (optional)</label>
            <Textarea
              placeholder="e.g., Focus on lender engagement metrics, include risk analysis section..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Presentation className="h-4 w-4" />
                Generate {format === 'presentation' ? 'Presentation' : 'Document'}
              </>
            )}
          </Button>

          {/* Generation Status */}
          {currentGeneration && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Generation Status</span>
                <Badge variant={
                  currentGeneration.status === 'completed' ? 'default' :
                  currentGeneration.status === 'failed' ? 'destructive' : 'secondary'
                }>
                  {currentGeneration.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  {currentGeneration.status}
                </Badge>
              </div>
              
              {currentGeneration.status === 'completed' && currentGeneration.gammaUrl && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <a href={currentGeneration.gammaUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in Gamma
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setEmbedUrl(currentGeneration.gammaUrl!);
                      setShowEmbed(true);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>
                  {currentGeneration.pdfUrl && (
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <a href={currentGeneration.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </a>
                    </Button>
                  )}
                  {currentGeneration.pptxUrl && (
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <a href={currentGeneration.pptxUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                        PPTX
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Embed Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />
            Embed Gamma Presentation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste Gamma URL (e.g., https://gamma.app/docs/...)"
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button size="sm" onClick={handleEmbed} disabled={!embedUrl} className="shrink-0">
              Embed
            </Button>
          </div>

          {showEmbed && embedUrl && (
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{embedUrl}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 px-2 gap-1" asChild>
                    <a href={embedUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      <span className="text-xs">Open</span>
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setShowEmbed(false)}>
                    <span className="text-xs">Close</span>
                  </Button>
                </div>
              </div>
              <iframe
                src={getEmbedUrl(embedUrl)}
                className="w-full"
                style={{ height: '450px', border: 'none' }}
                allow="fullscreen"
                title="Gamma Presentation"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {generationHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Recent Generations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {generationHistory.map((gen, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Presentation className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm capitalize">{gen.format}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(gen.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => { setEmbedUrl(gen.url); setShowEmbed(true); }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2" asChild>
                        <a href={gen.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
