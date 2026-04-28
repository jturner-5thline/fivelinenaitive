import { useState } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, ListTodo, Briefcase, Landmark, User, Tag, Target, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TaskViewTab, TaskTabFilterConfig } from '@/hooks/useTaskViewTabs';
import { TaskTabEditDialog } from './TaskTabEditDialog';
import type { Task } from '@/hooks/useTasks';

const ICON_MAP: Record<string, React.ElementType> = {
  'list-todo': ListTodo,
  'briefcase': Briefcase,
  'landmark': Landmark,
  'user': User,
  'tag': Tag,
  'target': Target,
  'folder': Folder,
};

function getTabIcon(iconName: string | null) {
  if (!iconName) return ListTodo;
  return ICON_MAP[iconName] || ListTodo;
}

export function applyTabFilter(tasks: Task[], config: TaskTabFilterConfig, userId?: string): Task[] {
  return tasks.filter(t => {
    if (config.has_deal === true && !t.deal_id) return false;
    if (config.has_deal === false && t.deal_id) return false;
    if (config.has_lender === true && !(t as any).lender_id) return false;
    if (config.has_lender === false && (t as any).lender_id) return false;
    if (config.has_crm_company === true && !t.crm_company_id) return false;
    if (config.has_crm_company === false && t.crm_company_id) return false;
    if (config.specific_deal_id && t.deal_id !== config.specific_deal_id) return false;
    if (config.specific_lender_id && (t as any).lender_id !== config.specific_lender_id) return false;
    if (config.created_by_me && userId && t.assigned_by !== userId) return false;
    if (config.assigned_to_me && userId && t.assigned_to !== userId) return false;
    return true;
  });
}

interface TaskTabBarProps {
  tabs: TaskViewTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  tasks: Task[]; // For computing counts
  userId?: string;
  onCreateTab: (tab: { name: string; filter_config: TaskTabFilterConfig; icon?: string }) => void;
  onUpdateTab: (tab: { id: string; name?: string; filter_config?: TaskTabFilterConfig; icon?: string | null }) => void;
  onDeleteTab: (id: string) => void;
  onReorderTabs: (orderedIds: string[]) => void;
}

export function TaskTabBar({
  tabs, activeTabId, onSelectTab, tasks, userId,
  onCreateTab, onUpdateTab, onDeleteTab, onReorderTabs,
}: TaskTabBarProps) {
  const [editingTab, setEditingTab] = useState<TaskViewTab | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const getCount = (config: TaskTabFilterConfig) => {
    if (Object.keys(config).length === 0) return tasks.length;
    return applyTabFilter(tasks, config, userId).length;
  };

  const handleMoveLeft = (tab: TaskViewTab) => {
    const idx = tabs.findIndex(t => t.id === tab.id);
    if (idx <= 0) return;
    const ids = tabs.map(t => t.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    onReorderTabs(ids);
  };

  const handleMoveRight = (tab: TaskViewTab) => {
    const idx = tabs.findIndex(t => t.id === tab.id);
    if (idx >= tabs.length - 1) return;
    const ids = tabs.map(t => t.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    onReorderTabs(ids);
  };

  return (
    <>
      <div className="flex items-center gap-1 px-6 py-1.5 overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        {tabs.map(tab => {
          const Icon = getTabIcon(tab.icon);
          const isActive = tab.id === activeTabId;
          const count = getCount(tab.filter_config);
          const isAllTasks = tab.name === 'All Tasks' && tab.is_default;

          return (
            <div key={tab.id} className="flex items-center group relative">
              <button
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all whitespace-nowrap',
                  isActive ? '' : 'hover:bg-[rgba(255,255,255,0.03)]'
                )}
                style={{
                  backgroundColor: isActive ? 'rgba(126,184,247,0.1)' : 'transparent',
                  color: isActive ? '#cfe3ff' : '#7a8194',
                  border: `1px solid ${isActive ? 'rgba(126,184,247,0.22)' : 'transparent'}`,
                }}
              >
                <Icon className="h-3 w-3" />
                {tab.name}
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-4 min-w-[16px] px-1 text-[10px] font-medium rounded',
                    isActive ? 'bg-[rgba(126,184,247,0.18)] text-[#cfe3ff]' : 'bg-[rgba(255,255,255,0.04)] text-[#7a8194]'
                  )}
                >
                  {count}
                </Badge>
              </button>

              {/* Kebab menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity ml-[-4px]',
                      'hover:bg-[rgba(255,255,255,0.05)]'
                    )}
                    style={{ color: '#7a8194' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[140px]">
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => setEditingTab(tab)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => handleMoveLeft(tab)} disabled={tabs.indexOf(tab) === 0}>
                    <ChevronLeft className="h-3 w-3" /> Move Left
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => handleMoveRight(tab)} disabled={tabs.indexOf(tab) === tabs.length - 1}>
                    <ChevronRight className="h-3 w-3" /> Move Right
                  </DropdownMenuItem>
                  {!isAllTasks && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs gap-2 text-destructive" onClick={() => onDeleteTab(tab.id)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          style={{ color: '#7a8194' }}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Create dialog */}
      <TaskTabEditDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={(data) => {
          onCreateTab(data);
          setShowCreate(false);
        }}
      />

      {/* Edit dialog */}
      {editingTab && (
        <TaskTabEditDialog
          open={!!editingTab}
          onClose={() => setEditingTab(null)}
          tab={editingTab}
          onSave={(data) => {
            onUpdateTab({ id: editingTab.id, ...data });
            setEditingTab(null);
          }}
        />
      )}
    </>
  );
}
