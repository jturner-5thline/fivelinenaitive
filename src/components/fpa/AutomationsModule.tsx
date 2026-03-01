import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap, Clock, Bell, Plus, Shield, GitBranch
} from 'lucide-react';
import { PipelineBuilder } from './automations/PipelineBuilder';
import { RuleMonitor } from './automations/RuleMonitor';
import { AlertingConfig } from './automations/AlertingConfig';
import { AuditTrail } from './automations/AuditTrail';

export function AutomationsModule() {
  const [subTab, setSubTab] = useState('pipelines');

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pipelines" className="gap-1.5 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              Pipelines
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Rules
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">6</Badge>
            </TabsTrigger>
            <TabsTrigger value="alerting" className="gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" />
              Alerting
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Audit Log
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pipelines" className="mt-4">
          <PipelineBuilder />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <RuleMonitor />
        </TabsContent>

        <TabsContent value="alerting" className="mt-4">
          <AlertingConfig />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTrail />
        </TabsContent>
      </Tabs>
    </div>
  );
}
