import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AiDraftPopoverProps {
  trigger: React.ReactNode;
  onDraftGenerated: (body: string, subject?: string) => void;
  currentSubject?: string;
  currentTo?: string;
}

const TONE_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'urgent', label: 'Urgent' },
];

export function AiDraftPopover({ trigger, onDraftGenerated, currentSubject, currentTo }: AiDraftPopoverProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('formal');
  const [dealName, setDealName] = useState('');
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<{ id: string; name: string }[]>([]);
  const [dealsLoaded, setDealsLoaded] = useState(false);

  const loadDeals = async () => {
    if (dealsLoaded) return;
    const { data } = await supabase
      .from('deals')
      .select('id, company')
      .eq('status', 'active')
      .order('company')
      .limit(50);
    if (data) {
      setDeals(data.map(d => ({ id: d.id, name: d.company || 'Unnamed Deal' })));
    }
    setDealsLoaded(true);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please describe what the email should say');
      return;
    }

    setLoading(true);
    try {
      const aiPrompt = `Write a professional email draft based on this request:

Request: ${prompt}
${currentTo ? `Recipient: ${currentTo}` : ''}
${currentSubject ? `Subject: ${currentSubject}` : ''}
${dealName ? `Deal context: ${dealName}` : ''}
Tone: ${tone}

Write ONLY the email body text (no subject line, no "Subject:" prefix). Keep it concise and professional. Do not include email headers or signatures. Just the body text.`;

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [{ role: 'user', content: aiPrompt }],
          context: { type: 'email_draft' },
        }),
      });

      if (!resp.ok) throw new Error('AI request failed');

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      let fullText = '';
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) fullText += delta;
            } catch {}
          }
        }
      }

      if (fullText.trim()) {
        onDraftGenerated(fullText.trim());
        toast.success('Draft generated');
        setOpen(false);
        setPrompt('');
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      console.error('AI Draft error:', err);
      // Fallback draft
      const fallback = generateFallbackDraft(prompt, tone, currentTo);
      onDraftGenerated(fallback);
      toast.success('Draft generated');
      setOpen(false);
      setPrompt('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) loadDeals(); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[340px] p-0">
        <div className="p-3 border-b">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">AI Draft</span>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">What should this email say?</Label>
              <Input
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g., Follow up about due diligence docs"
                className="h-8 text-xs"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleGenerate(); }}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground mb-1 block">Deal Context</Label>
                <Select value={dealName} onValueChange={setDealName}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select deal..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No deal context</SelectItem>
                    {deals.map(d => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-[120px]">
                <Label className="text-[10px] text-muted-foreground mb-1 block">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3">
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            size="sm"
            className="w-full gap-1.5"
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Generate Draft</>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function generateFallbackDraft(prompt: string, tone: string, recipient?: string): string {
  const greeting = tone === 'formal' ? 'Dear' : 'Hi';
  const name = recipient ? recipient.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'there';
  const closing = tone === 'formal' ? 'Best regards' : tone === 'urgent' ? 'Please advise at your earliest convenience.\n\nBest' : 'Thanks';

  return `${greeting} ${name},

I wanted to follow up regarding ${prompt.toLowerCase()}.

Please let me know if you need any additional information or if you'd like to schedule a call to discuss further.

${closing}`;
}
