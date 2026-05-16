import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sparkles, Plus, ArrowRight } from 'lucide-react';
import { KPI_TEMPLATES, type KpiTemplateId } from './kpiTemplates';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Insert a KPI built from a template. */
  onPickTemplate: (templateId: KpiTemplateId) => void;
  /** Insert a blank custom KPI (legacy actual/target/format). */
  onPickCustom: () => void;
}

/** Template-first picker. Defaults to the Templates tab; Custom remains
 *  available so users can still author free-form KPIs. */
export function AddKpiDialog({ open, onClose, onPickTemplate, onPickCustom }: Props) {
  const [tab, setTab] = useState<'templates' | 'custom'>('templates');
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add KPI</DialogTitle>
          <DialogDescription>
            Start from a pre-configured template or build a custom KPI from scratch.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as 'templates' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Templates
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-4 space-y-2">
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
          </TabsContent>

          <TabsContent value="custom" className="mt-4">
            <button
              type="button"
              onClick={() => { onPickCustom(); onClose(); }}
              className="w-full text-left rounded-md border border-border/60 bg-muted/20 px-3.5 py-3 hover:border-primary/50 hover:bg-muted/40 transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-semibold">Custom KPI</span>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    Manually enter actual, target, and format. Useful for one-off metrics not yet covered by a template.
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0" />
              </div>
            </button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}