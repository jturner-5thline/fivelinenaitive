import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GammaAIPromptBuilderProps {
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
  format: 'presentation' | 'document';
  onPromptGenerated: (prompt: string) => void;
}

export function GammaAIPromptBuilder({ dealData, format, onPromptGenerated }: GammaAIPromptBuilderProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('gamma-ai-prompt', {
        body: { dealData, format },
      });

      if (error) throw error;
      if (data?.prompt) {
        onPromptGenerated(data.prompt);
        toast.success('AI prompt suggestion ready!');
      }
    } catch (err) {
      console.error('AI prompt generation error:', err);
      toast.error('Failed to generate AI prompt suggestion');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={isGenerating}
      className="gap-1.5 text-xs h-7"
    >
      {isGenerating ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      AI Suggest
    </Button>
  );
}
