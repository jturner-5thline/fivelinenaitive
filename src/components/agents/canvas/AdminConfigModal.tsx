import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Shield, Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { AGENT_NODE_CATEGORIES } from './agentNodeRegistry';
import type { ModuleDefinition } from './types';

export interface AdminBuilderConfig {
  enabledCategories: Record<string, boolean>;
  lockedModules: string[];
  cloneableModules: string[];
  templatesVisible: boolean;
  wizardVisible: boolean;
}

const STORAGE_KEY = 'agent-builder-admin-config';

const DEFAULT_CONFIG: AdminBuilderConfig = {
  enabledCategories: Object.fromEntries(AGENT_NODE_CATEGORIES.map(c => [c.key, true])),
  lockedModules: [],
  cloneableModules: [],
  templatesVisible: true,
  wizardVisible: true,
};

export function loadAdminConfig(): AdminBuilderConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      enabledCategories: { ...DEFAULT_CONFIG.enabledCategories, ...stored.enabledCategories },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveAdminConfig(config: AdminBuilderConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface AdminConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: ModuleDefinition[];
  onConfigChange: (config: AdminBuilderConfig) => void;
}

export function AdminConfigModal({ open, onOpenChange, modules, onConfigChange }: AdminConfigModalProps) {
  const [config, setConfig] = useState<AdminBuilderConfig>(loadAdminConfig);

  const toggleCategory = (key: string) => {
    setConfig(prev => ({
      ...prev,
      enabledCategories: { ...prev.enabledCategories, [key]: !prev.enabledCategories[key] },
    }));
  };

  const toggleModuleLock = (id: string) => {
    setConfig(prev => ({
      ...prev,
      lockedModules: prev.lockedModules.includes(id)
        ? prev.lockedModules.filter(m => m !== id)
        : [...prev.lockedModules, id],
    }));
  };

  const toggleModuleCloneable = (id: string) => {
    setConfig(prev => ({
      ...prev,
      cloneableModules: prev.cloneableModules.includes(id)
        ? prev.cloneableModules.filter(m => m !== id)
        : [...prev.cloneableModules, id],
    }));
  };

  const handleSave = () => {
    saveAdminConfig(config);
    onConfigChange(config);
    onOpenChange(false);
    toast.success('Admin configuration saved');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin Builder Config
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 pr-2">
            {/* Category visibility */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Node Categories</h4>
              <p className="text-[10px] text-muted-foreground mb-2">Toggle which categories non-admin users can see in the palette.</p>
              <div className="space-y-2">
                {AGENT_NODE_CATEGORIES.map(cat => (
                  <div key={cat.key} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      {config.enabledCategories[cat.key] ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Label className="text-xs">{cat.label}</Label>
                    </div>
                    <Switch
                      checked={config.enabledCategories[cat.key] ?? true}
                      onCheckedChange={() => toggleCategory(cat.key)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Feature toggles */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Features</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <Label className="text-xs">Show Templates Panel</Label>
                  <Switch
                    checked={config.templatesVisible}
                    onCheckedChange={v => setConfig(p => ({ ...p, templatesVisible: v }))}
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <Label className="text-xs">Show AI Wizard</Label>
                  <Switch
                    checked={config.wizardVisible}
                    onCheckedChange={v => setConfig(p => ({ ...p, wizardVisible: v }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Module permissions */}
            {modules.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Module Permissions</h4>
                <div className="space-y-2">
                  {modules.map(mod => (
                    <div key={mod.id} className="p-2 rounded-md border border-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm">{mod.icon}</span>
                        <span className="text-xs font-medium flex-1">{mod.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          className="flex items-center gap-1 text-[10px]"
                          onClick={() => toggleModuleLock(mod.id)}
                        >
                          {config.lockedModules.includes(mod.id)
                            ? <><Lock className="h-3 w-3 text-chart-3" /> Locked</>
                            : <><Unlock className="h-3 w-3 text-muted-foreground" /> Editable</>
                          }
                        </button>
                        <button
                          className="flex items-center gap-1 text-[10px]"
                          onClick={() => toggleModuleCloneable(mod.id)}
                        >
                          {config.cloneableModules.includes(mod.id)
                            ? <span className="text-primary">✓ Cloneable</span>
                            : <span className="text-muted-foreground">Not cloneable</span>
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>
            <Shield className="h-4 w-4 mr-1" /> Save Config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
