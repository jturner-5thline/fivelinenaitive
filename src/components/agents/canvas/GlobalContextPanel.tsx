import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { X, Plus, Trash2, Settings2, Key, Shield, Globe } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GlobalContext } from './types';

interface GlobalContextPanelProps {
  context: GlobalContext;
  onChange: (context: GlobalContext) => void;
  onClose: () => void;
}

const DEFAULT_CONTEXT: GlobalContext = {
  envVars: [],
  sharedContext: {
    company_id: '',
    user_id: '',
    environment: 'development',
    default_llm: 'anthropic/claude-sonnet-4-5',
    default_temperature: 0.7,
  },
  authBindings: [
    { tool: 'Slack', authType: 'oauth', configured: false },
    { tool: 'Email (Resend)', authType: 'api_key', configured: false },
    { tool: 'Web Search', authType: 'api_key', configured: false },
    { tool: 'Database', authType: 'service_role', configured: true },
  ],
};

export function GlobalContextPanel({ context, onChange, onClose }: GlobalContextPanelProps) {
  const [ctx, setCtx] = useState<GlobalContext>(() => ({
    ...DEFAULT_CONTEXT,
    ...context,
    sharedContext: { ...DEFAULT_CONTEXT.sharedContext, ...context.sharedContext },
    authBindings: context.authBindings?.length ? context.authBindings : DEFAULT_CONTEXT.authBindings,
  }));

  useEffect(() => {
    onChange(ctx);
  }, [ctx]);

  const addEnvVar = () => {
    setCtx(prev => ({
      ...prev,
      envVars: [...prev.envVars, { key: '', value: '' }],
    }));
  };

  const removeEnvVar = (index: number) => {
    setCtx(prev => ({
      ...prev,
      envVars: prev.envVars.filter((_, i) => i !== index),
    }));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', val: string) => {
    setCtx(prev => ({
      ...prev,
      envVars: prev.envVars.map((ev, i) => i === index ? { ...ev, [field]: val } : ev),
    }));
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Global Context</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="context" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-3 h-8">
          <TabsTrigger value="context" className="text-xs"><Globe className="h-3 w-3 mr-1" />Context</TabsTrigger>
          <TabsTrigger value="env" className="text-xs"><Key className="h-3 w-3 mr-1" />Env</TabsTrigger>
          <TabsTrigger value="auth" className="text-xs"><Shield className="h-3 w-3 mr-1" />Auth</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="context" className="p-3 space-y-3 mt-0">
            <div className="space-y-1.5">
              <Label className="text-xs">Company ID</Label>
              <Input
                value={ctx.sharedContext.company_id}
                onChange={e => setCtx(p => ({ ...p, sharedContext: { ...p.sharedContext, company_id: e.target.value } }))}
                placeholder="Auto-detected at runtime"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">User ID</Label>
              <Input
                value={ctx.sharedContext.user_id}
                onChange={e => setCtx(p => ({ ...p, sharedContext: { ...p.sharedContext, user_id: e.target.value } }))}
                placeholder="Auto-detected at runtime"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Environment</Label>
              <Select
                value={ctx.sharedContext.environment}
                onValueChange={v => setCtx(p => ({ ...p, sharedContext: { ...p.sharedContext, environment: v as any } }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="development" className="text-xs">Development</SelectItem>
                  <SelectItem value="staging" className="text-xs">Staging</SelectItem>
                  <SelectItem value="production" className="text-xs">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Default LLM</Label>
              <Select
                value={ctx.sharedContext.default_llm}
                onValueChange={v => setCtx(p => ({ ...p, sharedContext: { ...p.sharedContext, default_llm: v } }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-2.5-flash" className="text-xs">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro" className="text-xs">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="openai/gpt-5-mini" className="text-xs">GPT-5 Mini</SelectItem>
                  <SelectItem value="openai/gpt-5" className="text-xs">GPT-5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Temperature</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={ctx.sharedContext.default_temperature}
                onChange={e => setCtx(p => ({ ...p, sharedContext: { ...p.sharedContext, default_temperature: parseFloat(e.target.value) || 0.7 } }))}
                className="h-8 text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="env" className="p-3 space-y-3 mt-0">
            <p className="text-[10px] text-muted-foreground">Define environment variables available to all nodes at runtime.</p>
            {ctx.envVars.map((ev, i) => (
              <div key={i} className="flex gap-1.5">
                <Input
                  value={ev.key}
                  onChange={e => updateEnvVar(i, 'key', e.target.value)}
                  placeholder="KEY"
                  className="h-7 text-xs flex-1 font-mono"
                />
                <Input
                  value={ev.value}
                  onChange={e => updateEnvVar(i, 'value', e.target.value)}
                  placeholder="value"
                  className="h-7 text-xs flex-1"
                  type="password"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeEnvVar(i)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={addEnvVar}>
              <Plus className="h-3 w-3 mr-1" /> Add Variable
            </Button>
          </TabsContent>

          <TabsContent value="auth" className="p-3 space-y-3 mt-0">
            <p className="text-[10px] text-muted-foreground">Configure authentication bindings for tool nodes.</p>
            {ctx.authBindings.map((binding, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-md border border-border">
                <div>
                  <p className="text-xs font-medium">{binding.tool}</p>
                  <p className="text-[10px] text-muted-foreground">{binding.authType}</p>
                </div>
                <Switch
                  checked={binding.configured}
                  onCheckedChange={v => {
                    setCtx(prev => ({
                      ...prev,
                      authBindings: prev.authBindings.map((b, j) =>
                        j === i ? { ...b, configured: v } : b
                      ),
                    }));
                  }}
                />
              </div>
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
