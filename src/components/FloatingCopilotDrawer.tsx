import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { MessageSquare, X, Pin } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardAIInput } from '@/components/dashboard/DashboardAIInput';
import { PinnedInsightsPanel } from '@/components/dashboard/chat/PinnedInsightsPanel';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useCopilotStore } from '@/stores/copilotStore';
import { useAnyDialogOpen } from '@/hooks/useAnyDialogOpen';

export function FloatingCopilotDrawer() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { hasPageAccess, isLoading } = usePageAccessFlags();
  const copilotEnabled = hasPageAccess('copilot_widget');
  const copilotPanelOpen = useCopilotStore((s) => s.isOpen);
  const anyDialogOpen = useAnyDialogOpen();

  // Hide on landing, auth, login, and public pages
  const hiddenPaths = ['/', '/home', '/homepage', '/login', '/auth', '/onboarding', '/create-account', '/waitlist', '/join'];
  if (!user || hiddenPaths.includes(location.pathname)) return null;
  if (isLoading || !copilotEnabled) return null;

  // Hide entirely when the AICopilotPanel is open to avoid duplicate AI surfaces
  if (copilotPanelOpen) return null;

  // Hide trigger when any dashboard widget pop-up / dialog is open so it
  // doesn't overlap. The Sheet itself stays mounted so it can re-open.
  const hideTrigger = anyDialogOpen && !open;

  const content = (
    <>
      {/* Floating trigger button */}
      {!open && !hideTrigger && (
         <button
          onClick={() => setOpen(true)}
          className={cn(
            'fixed z-[9999] h-12 w-12 rounded-full',
            'bottom-6 right-6',
            'bg-primary text-primary-foreground shadow-lg',
            'hover:scale-105 active:scale-95 transition-all duration-200',
            'flex items-center justify-center',
            'animate-in fade-in duration-150',
            'shadow-[0_4px_20px_hsl(var(--primary)/0.4)]'
          )}
          title="Open naitive AI"
          aria-label="Open naitive AI"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:w-[480px] p-0 flex flex-col bg-background border-l border-border">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                naitive AI
              </SheetTitle>
            </div>
          </SheetHeader>

          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-2 grid grid-cols-2 shrink-0">
              <TabsTrigger value="chat" className="text-xs gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="pinned" className="text-xs gap-1.5">
                <Pin className="h-3.5 w-3.5" />
                Pinned
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 min-h-0 px-4 pb-4 mt-2">
              <DashboardAIInput isDrawerMode />
            </TabsContent>

            <TabsContent value="pinned" className="flex-1 min-h-0 px-4 pb-4 mt-2">
              <PinnedInsightsPanel />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );

  return createPortal(content, document.body);
}
