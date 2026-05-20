import { useState, useEffect, useCallback } from 'react';
import { 
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, 
  CommandItem, CommandList, CommandSeparator 
} from 'cmdk';
import { 
  FileText, Users, Settings, Mail, Search, Zap, 
  MessageSquare, BarChart3, Upload, Plus, ArrowRight,
  CheckSquare, AlertTriangle, Flag
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';

interface DealCommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateTab: (tab: string) => void;
  onAction: (action: string) => void;
  dealName?: string;
  lenderCount?: number;
  milestoneCount?: number;
}

export function DealCommandPalette({ 
  isOpen, 
  onOpenChange, 
  onNavigateTab, 
  onAction,
  dealName,
  lenderCount = 0,
  milestoneCount = 0,
}: DealCommandPaletteProps) {
  
  // Global keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!isOpen);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, onOpenChange]);

  const handleSelect = useCallback((value: string) => {
    onOpenChange(false);
    
    // Tab navigation
    if (value.startsWith('tab:')) {
      onNavigateTab(value.replace('tab:', ''));
      return;
    }
    
    // Actions
    onAction(value);
  }, [onOpenChange, onNavigateTab, onAction]);

  return (
    <CommandDialog open={isOpen} onOpenChange={onOpenChange}>
      <Command className="rounded-lg border shadow-md">
        <CommandInput placeholder={`Search ${dealName || 'deal'}...`} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          
          <CommandGroup heading="Navigate">
            <CommandItem value="tab:deal-space" onSelect={handleSelect}>
              <Sparkles className="mr-2 h-4 w-4" />
              Deal Space
            </CommandItem>
            <CommandItem value="tab:deal-info" onSelect={handleSelect}>
              <FileText className="mr-2 h-4 w-4" />
              Deal Information
            </CommandItem>
            <CommandItem value="tab:lenders" onSelect={handleSelect}>
              <Users className="mr-2 h-4 w-4" />
              Lenders {lenderCount > 0 && `(${lenderCount})`}
            </CommandItem>
            <CommandItem value="tab:deal-management" onSelect={handleSelect}>
              <Settings className="mr-2 h-4 w-4" />
              Deal Management
            </CommandItem>
            <CommandItem value="tab:deal-writeup" onSelect={handleSelect}>
              <FileText className="mr-2 h-4 w-4" />
              Deal Write Up
            </CommandItem>
            <CommandItem value="tab:data-room" onSelect={handleSelect}>
              <Upload className="mr-2 h-4 w-4" />
              Data Room
            </CommandItem>
            <CommandItem value="tab:emails" onSelect={handleSelect}>
              <Mail className="mr-2 h-4 w-4" />
              Emails
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Quick Actions">
            <CommandItem value="add-lender" onSelect={handleSelect}>
              <Plus className="mr-2 h-4 w-4" />
              Add a Funding Source
            </CommandItem>
            <CommandItem value="add-milestone" onSelect={handleSelect}>
              <CheckSquare className="mr-2 h-4 w-4" />
              Add a Milestone
            </CommandItem>
            <CommandItem value="open-memo" onSelect={handleSelect}>
              <FileText className="mr-2 h-4 w-4" />
              Open Deal Memo
            </CommandItem>
            <CommandItem value="ask-ai" onSelect={handleSelect}>
              <Sparkles className="mr-2 h-4 w-4" />
              Ask AI Assistant
            </CommandItem>
            <CommandItem value="export-report" onSelect={handleSelect}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Export Status Report
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="AI Tools">
            <CommandItem value="ai-summarize" onSelect={handleSelect}>
              <Zap className="mr-2 h-4 w-4" />
              Generate Deal Summary
            </CommandItem>
            <CommandItem value="ai-next-steps" onSelect={handleSelect}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Suggest Next Steps
            </CommandItem>
            <CommandItem value="ai-risks" onSelect={handleSelect}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Analyze Risks
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
