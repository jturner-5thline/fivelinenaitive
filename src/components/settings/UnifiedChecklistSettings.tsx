import { useState } from 'react';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DataRoomChecklistSettings } from './DataRoomChecklistSettings';
import { DefaultChecklistSettings } from './DefaultChecklistSettings';

interface UnifiedChecklistSettingsProps {
  isAdmin?: boolean;
}

export function UnifiedChecklistSettings({ isAdmin = true }: UnifiedChecklistSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left flex-1">
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Data Room Checklists
                </CardTitle>
                <CardDescription className="mt-1">
                  Manage both the standard data room checklist and deal-type-specific checklist defaults.
                </CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Standard Checklist */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Standard Checklist</h3>
              <DataRoomChecklistSettings embedded />
            </div>

            <Separator />

            {/* Deal-Type Checklist Defaults */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Deal-Type Checklist Defaults</h3>
              <DefaultChecklistSettings isAdmin={isAdmin} embedded />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
