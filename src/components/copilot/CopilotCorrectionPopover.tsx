import { useState } from 'react';
import { Send, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

interface CopilotCorrectionPopoverProps {
  originalResponse: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CopilotCorrectionPopover({ originalResponse, onClose, onSaved }: CopilotCorrectionPopoverProps) {
  const [correction, setCorrection] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { company } = useCompany();

  const handleSubmit = async () => {
    if (!correction.trim() || !user || !company) return;
    setSaving(true);
    try {
      const ruleText = `When asked similar questions, the AI should: ${correction.trim()}`;
      const { error } = await supabase.from('copilot_user_preferences').insert({
        organization_id: company.id,
        rule_text: ruleText,
        category: 'behavior',
        source: 'thumbs_down',
        original_ai_response: originalResponse.slice(0, 2000),
        user_correction: correction.trim(),
        created_by: user.id,
      });
      if (error) throw error;
      toast.success('Feedback saved — the AI will learn from this correction');
      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save correction:', err);
      toast.error('Failed to save correction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 4,
        background: 'rgba(8, 10, 18, 0.95)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        padding: 12,
        zIndex: 80,
        width: 300,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          What should the AI have done differently?
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={correction}
        onChange={(e) => setCorrection(e.target.value)}
        placeholder="e.g., Show values in millions, use bullet points instead of paragraphs..."
        rows={3}
        autoFocus
        style={{
          width: '100%',
          background: 'var(--glass-surface)',
          border: '1px solid var(--glass-border)',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 13,
          color: 'var(--foreground)',
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: 1.4,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={!correction.trim() || saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'hsl(var(--primary))',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 500,
            cursor: correction.trim() && !saving ? 'pointer' : 'default',
            opacity: correction.trim() && !saving ? 1 : 0.5,
          }}
        >
          <Send size={12} />
          {saving ? 'Saving...' : 'Save Feedback'}
        </button>
      </div>
    </div>
  );
}
