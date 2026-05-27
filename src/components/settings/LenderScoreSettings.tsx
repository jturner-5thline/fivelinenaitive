import { useState, useEffect } from 'react';
import { Save, Loader2, RotateCcw, ChevronDown, Hash, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { DEFAULT_SCORE_LEVELS, type ScoreLevelConfig } from '@/hooks/useLenderScoreConfig';
import { cn } from '@/lib/utils';

interface LenderScoreSettingsProps {
  isAdmin?: boolean;
}

const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#6b7280',
];

export function LenderScoreSettings({ isAdmin = true }: LenderScoreSettingsProps) {
  const { company } = useCompany();
  const [enabled, setEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [levels, setLevels] = useState<Record<number, ScoreLevelConfig>>({ ...DEFAULT_SCORE_LEVELS });
  const [savedLevels, setSavedLevels] = useState<Record<number, ScoreLevelConfig>>({ ...DEFAULT_SCORE_LEVELS });
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('deals_special_widgets')
        .eq('company_id', company.id)
        .single();

      const config = data?.deals_special_widgets as Record<string, unknown> | null;
      if (config && typeof config.lender_score === 'object' && config.lender_score !== null) {
        const sc = config.lender_score as { enabled?: boolean; levels?: Record<number, ScoreLevelConfig> };
        const val = sc.enabled !== false;
        setEnabled(val);
        setSavedEnabled(val);
        if (sc.levels) {
          const merged = { ...DEFAULT_SCORE_LEVELS, ...sc.levels };
          setLevels(merged);
          setSavedLevels(merged);
        }
      }
    })();
  }, [company?.id]);

  const hasChanges = enabled !== savedEnabled || JSON.stringify(levels) !== JSON.stringify(savedLevels);

  const handleSave = async () => {
    if (!company?.id) return;
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from('company_settings')
        .select('deals_special_widgets')
        .eq('company_id', company.id)
        .single();

      const current = (existing?.deals_special_widgets as Record<string, unknown>) || {};
      const merged = { ...current, lender_score: { enabled, levels } };

      const { error } = await supabase
        .from('company_settings')
        .update({ deals_special_widgets: merged as any })
        .eq('company_id', company.id);

      if (error) throw error;
      setSavedEnabled(enabled);
      setSavedLevels({ ...levels });
      toast({ title: 'Lender score settings updated' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save', description: 'Could not update lender score settings.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateLevel = (score: number, updates: Partial<ScoreLevelConfig>) => {
    setLevels(prev => ({
      ...prev,
      [score]: { ...prev[score], ...updates },
    }));
  };

  const handleResetColors = () => {
    setEnabled(savedEnabled);
    setLevels({ ...savedLevels });
  };

  const handleResetToDefaults = () => {
    setLevels({ ...DEFAULT_SCORE_LEVELS });
  };

  return (
    
      <Card>
        
          <CardHeader className=" rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Hash className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Lender Score Tags</CardTitle>
                  <CardDescription>Configure score labels, colors, and visibility</CardDescription>
                </div>
              </div>
              
            </div>
          </CardHeader>
        

        
          <CardContent className="space-y-5 pt-0">
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only admins can modify these settings.</p>
            )}

            {/* Enable toggle */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
              <div>
                <Label className="text-sm font-medium cursor-pointer" htmlFor="lender-score-toggle">
                  Enable Lender Score
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show score indicators on lender cards and in the funding source detail pop-up.
                </p>
              </div>
              <Switch
                id="lender-score-toggle"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!isAdmin}
              />
            </div>

            {/* Score level customization */}
            {enabled && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Score Levels</h4>
                  <Button variant="ghost" size="sm" onClick={handleResetToDefaults} className="text-xs h-7 gap-1">
                    <RotateCcw className="h-3 w-3" />
                    Defaults
                  </Button>
                </div>

                {[1, 2, 3].map((score) => {
                  const level = levels[score];
                  return (
                    <div key={score} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/10">
                      {/* Preview badge */}
                      <span
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: `${level.color}20`,
                          color: level.color,
                          boxShadow: `0 0 0 1.5px ${level.color}66`,
                        }}
                      >
                        {score}
                      </span>

                      {/* Label input */}
                      <div className="flex-1">
                        <Input
                          value={level.label}
                          onChange={(e) => updateLevel(score, { label: e.target.value })}
                          disabled={!isAdmin}
                          className="h-8 text-sm"
                          placeholder={`Score ${score} label`}
                        />
                      </div>

                      {/* Color picker */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            disabled={!isAdmin}
                            className={cn(
                              "h-8 w-8 rounded-md border border-border/50 shrink-0 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/40",
                              !isAdmin && "opacity-50 cursor-not-allowed"
                            )}
                            style={{ backgroundColor: level.color }}
                            title="Pick color"
                          />
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-3" align="end">
                          <p className="text-xs font-medium mb-2 text-muted-foreground">Choose a color</p>
                          <div className="grid grid-cols-8 gap-1.5 mb-3">
                            {COLOR_PRESETS.map((c) => (
                              <button
                                key={c}
                                className={cn(
                                  "w-6 h-6 rounded-md transition-transform hover:scale-125 focus:outline-none",
                                  level.color === c && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                                )}
                                style={{ backgroundColor: c }}
                                onClick={() => updateLevel(score, { color: c })}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Palette className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <Input
                              value={level.color}
                              onChange={(e) => updateLevel(score, { color: e.target.value })}
                              className="h-7 text-xs font-mono"
                              placeholder="#hex"
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  );
                })}
              </div>
            )}

            {isAdmin && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  className="gap-1.5"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResetColors}
                  disabled={!hasChanges}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            )}
          </CardContent>
        
      </Card>
    
  );
}
