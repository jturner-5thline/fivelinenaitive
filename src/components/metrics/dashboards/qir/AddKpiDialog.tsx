import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles, Plus, ArrowRight, ChevronLeft } from 'lucide-react';
import { KPI_TEMPLATES, type KpiTemplateId } from './kpiTemplates';

type Step = 'chooser' | 'template-picker';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Insert a KPI built from a template. */
  onPickTemplate: (templateId: KpiTemplateId) => void;
  /** Insert a blank custom KPI (legacy actual/target/format). */
  onPickCustom: () => void;
}

/**
 * Two-step Add KPI flow:
 *   1. Chooser  → Template KPI (recommended) vs New KPI.
 *   2. Template picker → list of registered templates from KPI_TEMPLATES.
 * Picking "New KPI" inserts a blank manual KPI and closes the modal; the
 * caller's existing manual editor takes over from there.
 */
export function AddKpiDialog({ open, onClose, onPickTemplate, onPickCustom }: Props) {
  const [step, setStep] = useState<Step>('chooser');
  // Reset to the chooser every time the dialog opens so users always start
  // on the recommended-first screen (per spec).
  useEffect(() => { if (open) setStep('chooser'); }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'template-picker' && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setStep('chooser')}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <span>{step === 'chooser' ? 'Add KPI' : 'Pick a KPI template'}</span>
          </DialogTitle>
          <DialogDescription>
            {step === 'chooser'
              ? 'Choose a pre-configured KPI template or create a new KPI from scratch.'
              : 'Templates come with built-in logic, filtering, and drilldown.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'chooser' && (
          <div className="space-y-2.5">
            {/* Recommended: Template KPI */}
            <ChooserCard
              recommended
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="Template KPI"
              description="Start with a pre-configured KPI template. Built-in logic, filtering, and drilldown."
              onClick={() => setStep('template-picker')}
              autoFocus
            />
            {/* Manual fallback */}
            <ChooserCard
              icon={<Plus className="h-4 w-4 text-primary" />}
              title="New KPI"
              description="Create a KPI manually from custom inputs and logic."
              onClick={() => { onPickCustom(); onClose(); }}
            />
          </div>
        )}

        {step === 'template-picker' && (
          <div className="space-y-2">
            {KPI_TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => { onPickTemplate(tpl.id); onClose(); }}
                className="w-full text-left rounded-md border border-border/60 bg-muted/20 px-3.5 py-3 hover:border-primary/50 hover:bg-muted/40 transition group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-semibold">{tpl.label}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                      {tpl.bullets.map((b, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-muted-foreground/60">·</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChooserCard({
  icon, title, description, onClick, recommended, autoFocus,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  recommended?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className={
        'group w-full text-left rounded-md border px-3.5 py-3 transition ' +
        (recommended
          ? 'border-primary/50 bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/20'
          : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-muted/40')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold">{title}</span>
            {recommended && (
              <span className="rounded-sm bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                Recommended
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0" />
      </div>
    </button>
  );
}