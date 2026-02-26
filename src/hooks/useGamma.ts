import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GammaGeneration {
  generationId: string;
  status: 'pending' | 'completed' | 'failed';
  gammaUrl?: string;
  pdfUrl?: string;
  pptxUrl?: string;
}

interface GammaTheme {
  id: string;
  name: string;
  type: string;
}

export function useGamma() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGeneration, setCurrentGeneration] = useState<GammaGeneration | null>(null);
  const [themes, setThemes] = useState<GammaTheme[]>([]);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);

  const generate = useCallback(async (inputText: string, options?: {
    format?: 'presentation' | 'document' | 'webpage' | 'social';
    numCards?: number;
    themeId?: string;
  }) => {
    setIsGenerating(true);
    setCurrentGeneration(null);

    try {
      const { data, error } = await supabase.functions.invoke('gamma-integration', {
        body: {
          action: 'generate',
          inputText,
          format: options?.format || 'presentation',
          numCards: options?.numCards,
          themeId: options?.themeId,
        },
      });

      if (error) throw error;
      
      const generation: GammaGeneration = {
        generationId: data.generationId,
        status: 'pending',
      };
      setCurrentGeneration(generation);
      toast.success('Gamma presentation generation started!');

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const { data: statusData, error: statusError } = await supabase.functions.invoke('gamma-integration', {
            body: {
              action: 'status',
              generationId: data.generationId,
            },
          });

          if (statusError) throw statusError;

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            const completed: GammaGeneration = {
              generationId: data.generationId,
              status: 'completed',
              gammaUrl: statusData.gammaUrl,
              pdfUrl: statusData.pdfUrl,
              pptxUrl: statusData.pptxUrl,
            };
            setCurrentGeneration(completed);
            setIsGenerating(false);
            toast.success('Gamma presentation ready!');
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setCurrentGeneration({ generationId: data.generationId, status: 'failed' });
            setIsGenerating(false);
            toast.error('Gamma presentation generation failed');
          }
        } catch (err) {
          console.error('Poll error:', err);
          clearInterval(pollInterval);
          setIsGenerating(false);
          toast.error('Failed to check generation status');
        }
      }, 3000);

      // Auto-clear poll after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsGenerating(false);
      }, 300000);

      return generation;
    } catch (err) {
      console.error('Gamma generate error:', err);
      setIsGenerating(false);
      toast.error('Failed to generate Gamma presentation');
      return null;
    }
  }, []);

  const fetchThemes = useCallback(async () => {
    setIsLoadingThemes(true);
    try {
      const { data, error } = await supabase.functions.invoke('gamma-integration', {
        body: { action: 'themes' },
      });

      if (error) throw error;
      setThemes(data.data || []);
    } catch (err) {
      console.error('Gamma themes error:', err);
      toast.error('Failed to load Gamma themes');
    } finally {
      setIsLoadingThemes(false);
    }
  }, []);

  return {
    generate,
    fetchThemes,
    isGenerating,
    currentGeneration,
    themes,
    isLoadingThemes,
  };
}
