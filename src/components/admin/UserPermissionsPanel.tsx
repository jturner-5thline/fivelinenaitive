import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Search,
  User,
  LayoutDashboard,
  Briefcase,
  Newspaper,
  Sparkles,
  BarChart3,
  Lightbulb,
  Users,
  UserCog,
  Cog,
  Plug,
  Settings,
  HelpCircle,
  FileText,
  Download,
  Pencil,
  Trash2,
  Eye,
  DollarSign,
  Lock,
  Check,
  X,
  LucideIcon,
  MessageCircle
} from 'lucide-react';

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface UserPermissionState {
  dashboard: boolean;
  deals: boolean;
  newsFeed: boolean;
  research: boolean;
  metrics: boolean;
  insights: boolean;
  salesBd: boolean;
  hr: boolean;
  operations: boolean;
  integrations: boolean;
  admin: boolean;
  settings: boolean;
  help: boolean;
  lenders: boolean;
  analytics: boolean;
  reports: boolean;
  canExport: boolean;
  canBulkEdit: boolean;
  canDelete: boolean;
  canViewFinancials: boolean;
  canViewSensitive: boolean;
  chatWidget: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissionState = {
  dashboard: true,
  deals: true,
  newsFeed: true,
  research: true,
  metrics: true,
  insights: true,
  salesBd: true,
  hr: true,
  operations: true,
  integrations: true,
  settings: true,
  help: true,
  lenders: true,
  analytics: true,
  reports: true,
  admin: true,
  canExport: true,
  canBulkEdit: true,
  canDelete: true,
  canViewFinancials: true,
  canViewSensitive: true,
  chatWidget: true,
};

interface SectionConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const PAGE_SECTIONS: SectionConfig[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Main overview and stats' },
  { key: 'deals', label: 'Deals', icon: Briefcase, description: 'Deal management and pipeline' },
  { key: 'newsFeed', label: 'News Feed', icon: Newspaper, description: 'Industry news and updates' },
  { key: 'research', label: 'AI Research', icon: Sparkles, description: 'AI-powered research tools' },
  { key: 'metrics', label: 'Metrics', icon: BarChart3, description: 'Performance metrics and KPIs' },
  { key: 'insights', label: 'Insights', icon: Lightbulb, description: 'AI-generated insights' },
  { key: 'salesBd', label: 'Sales & BD', icon: Users, description: 'Sales and business development' },
  { key: 'hr', label: 'HR', icon: UserCog, description: 'Human resources tools' },
  { key: 'operations', label: 'Operations', icon: Cog, description: 'Operational management' },
  { key: 'lenders', label: 'Lenders Database', icon: Users, description: 'Master lender database' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Detailed analytics and charts' },
  { key: 'reports', label: 'Reports', icon: FileText, description: 'Custom report generation' },
  { key: 'integrations', label: 'Integrations', icon: Plug, description: 'Third-party integrations' },
  { key: 'settings', label: 'Settings', icon: Settings, description: 'App configuration' },
  { key: 'help', label: 'Help', icon: HelpCircle, description: 'Help and documentation' },
  { key: 'admin', label: 'Admin', icon: Lock, description: 'System administration panel' },
];

const CAPABILITY_SECTIONS: SectionConfig[] = [
  { key: 'canExport', label: 'Export Data', icon: Download, description: 'Export to CSV/PDF' },
  { key: 'canBulkEdit', label: 'Bulk Edit', icon: Pencil, description: 'Edit multiple records at once' },
  { key: 'canDelete', label: 'Delete Records', icon: Trash2, description: 'Permanently delete data' },
  { key: 'canViewFinancials', label: 'View Financials', icon: DollarSign, description: 'Access financial data' },
  { key: 'canViewSensitive', label: 'View Sensitive Info', icon: Eye, description: 'Access sensitive information' },
  { key: 'chatWidget', label: 'AI Chat Widget', icon: MessageCircle, description: 'Access AI search and chat assistant' },
];

const PERMISSIONS_UPDATED_EVENT = 'user_permissions_updated';

const getStoredPermissions = (): Record<string, UserPermissionState> => {
  const stored = localStorage.getItem('user_page_permissions');
  return stored ? JSON.parse(stored) : {};
};

const saveStoredPermissions = (permissions: Record<string, UserPermissionState>) => {
  localStorage.setItem('user_page_permissions', JSON.stringify(permissions));
  // Dispatch custom event to notify other components (like AISearchWidget)
  window.dispatchEvent(new CustomEvent(PERMISSIONS_UPDATED_EVENT));
};

export function UserPermissionsPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [userPermissions, setUserPermissions] = useState<Record<string, UserPermissionState>>({});
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['all-users-for-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, email, display_name, avatar_url, created_at')
        .order('email');
      
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  useEffect(() => {
    const stored = getStoredPermissions();
    setUserPermissions(stored);
  }, []);

  const getUserPermissions = (userId: string): UserPermissionState => {
    return userPermissions[userId] || DEFAULT_PERMISSIONS;
  };

  const updatePermission = (userId: string, key: keyof UserPermissionState, value: boolean) => {
    const currentPerms = getUserPermissions(userId);
    const newPerms = { ...currentPerms, [key]: value };
    const allPerms = { ...userPermissions, [userId]: newPerms };
    setUserPermissions(allPerms);
    saveStoredPermissions(allPerms);
    toast.success('Permission updated');
  };

  const toggleAllPermissions = (userId: string, enabled: boolean) => {
    const newPerms = Object.keys(DEFAULT_PERMISSIONS).reduce((acc, key) => {
      acc[key as keyof UserPermissionState] = enabled;
      return acc;
    }, {} as UserPermissionState);
    const allPerms = { ...userPermissions, [userId]: newPerms };
    setUserPermissions(allPerms);
    saveStoredPermissions(allPerms);
    toast.success(enabled ? 'All permissions enabled' : 'All permissions disabled');
  };

  const toggleAllUsersForPermission = (key: keyof UserPermissionState, enabled: boolean) => {
    if (!users) return;
    const allPerms = { ...userPermissions };
    users.forEach(user => {
      const currentPerms = getUserPermissions(user.user_id);
      allPerms[user.user_id] = { ...currentPerms, [key]: enabled };
    });
    setUserPermissions(allPerms);
    saveStoredPermissions(allPerms);
    toast.success(enabled ? 'Enabled for all users' : 'Disabled for all users');
  };

  const countEnabledPermissions = (userId: string): { pages: number; caps: number; total: number } => {
    const perms = getUserPermissions(userId);
    const pageKeys = PAGE_SECTIONS.map(s => s.key);
    const capKeys = CAPABILITY_SECTIONS.map(s => s.key);
    
    const pages = pageKeys.filter(k => perms[k as keyof UserPermissionState]).length;
    const caps = capKeys.filter(k => perms[k as keyof UserPermissionState]).length;
    
    return { pages, caps, total: pages + caps };
  };

  const countUsersWithPermission = (key: keyof UserPermissionState): number => {
    if (!users) return 0;
    return users.filter(u => getUserPermissions(u.user_id)[key]).length;
  };

  const filteredUsers = users?.filter(u => {
    const searchLower = searchQuery.toLowerCase();
    return (
      u.email?.toLowerCase().includes(searchLower) ||
      u.display_name?.toLowerCase().includes(searchLower)
    );
  });

  const getUserInitials = (user: UserProfile) => {
    if (user.display_name) {
      return user.display_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return user.email?.slice(0, 2).toUpperCase() || 'U';
  };

  if (usersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const renderUserRow = (user: UserProfile, permKey: keyof UserPermissionState) => {
    const enabled = getUserPermissions(user.user_id)[permKey];
    return (
      <div 
        key={user.user_id}
        className="flex items-center justify-between rounded-lg border p-2.5 bg-background"
      >
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={user.avatar_url || ''} />
            <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
              {getUserInitials(user)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user.display_name || user.email?.split('@')[0]}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => updatePermission(user.user_id, permKey, checked)}
        />
      </div>
    );
  };

  const renderSectionAccordion = (sections: SectionConfig[], type: 'pages' | 'capabilities') => (
    <Accordion 
      type="multiple" 
      value={expandedSections}
      onValueChange={setExpandedSections}
      className="space-y-2"
    >
      {sections.map((section) => {
        const Icon = section.icon;
        const permKey = section.key as keyof UserPermissionState;
        const enabledCount = countUsersWithPermission(permKey);
        const totalUsers = users?.length || 0;
        const allEnabled = enabledCount === totalUsers;

        return (
          <AccordionItem 
            key={section.key} 
            value={section.key}
            className="border rounded-lg bg-card px-4"
          >
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium text-sm">{section.label}</span>
                  <span className="text-xs text-muted-foreground">{section.description}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto mr-4">
                  <Badge variant={allEnabled ? 'default' : 'secondary'} className="text-xs">
                    {enabledCount}/{totalUsers} users
                  </Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => toggleAllUsersForPermission(permKey, true)}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Enable All
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => toggleAllUsersForPermission(permKey, false)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Disable All
                  </Button>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredUsers?.map(user => renderUserRow(user, permKey))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="text-xs">
          {users?.length || 0} users
        </Badge>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            By Users
          </TabsTrigger>
          <TabsTrigger value="pages" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            By Pages
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            By Capabilities
          </TabsTrigger>
        </TabsList>

        {/* By Users Tab */}
        <TabsContent value="users" className="mt-4">
          <ScrollArea className="h-[550px] pr-4">
            <Accordion 
              type="multiple" 
              value={expandedUsers}
              onValueChange={setExpandedUsers}
              className="space-y-2"
            >
              {filteredUsers?.map((user) => {
                const perms = getUserPermissions(user.user_id);
                const counts = countEnabledPermissions(user.user_id);
                const allEnabled = counts.total === PAGE_SECTIONS.length + CAPABILITY_SECTIONS.length;

                return (
                  <AccordionItem 
                    key={user.user_id} 
                    value={user.user_id}
                    className="border rounded-lg bg-card px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url || ''} />
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {getUserInitials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-sm">
                            {user.display_name || user.email?.split('@')[0]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto mr-4">
                          <Badge variant={allEnabled ? 'default' : 'secondary'} className="text-xs">
                            {counts.pages}/{PAGE_SECTIONS.length} pages
                          </Badge>
                          <Badge variant={counts.caps === CAPABILITY_SECTIONS.length ? 'default' : 'outline'} className="text-xs">
                            {counts.caps}/{CAPABILITY_SECTIONS.length} capabilities
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-4">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => toggleAllPermissions(user.user_id, true)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Enable All
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => toggleAllPermissions(user.user_id, false)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Disable All
                          </Button>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            Page Access
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {PAGE_SECTIONS.map((section) => {
                              const Icon = section.icon;
                              const enabled = perms[section.key as keyof UserPermissionState];
                              return (
                                <div 
                                  key={section.key}
                                  className="flex items-center justify-between rounded-lg border p-2.5 bg-background"
                                >
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">{section.label}</span>
                                  </div>
                                  <Switch
                                    checked={enabled}
                                    onCheckedChange={(checked) => 
                                      updatePermission(user.user_id, section.key as keyof UserPermissionState, checked)
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            Capabilities
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {CAPABILITY_SECTIONS.map((section) => {
                              const Icon = section.icon;
                              const enabled = perms[section.key as keyof UserPermissionState];
                              return (
                                <div 
                                  key={section.key}
                                  className="flex items-center justify-between rounded-lg border p-2.5 bg-background"
                                >
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <div className="flex flex-col">
                                      <span className="text-sm">{section.label}</span>
                                      <span className="text-xs text-muted-foreground">{section.description}</span>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={enabled}
                                    onCheckedChange={(checked) => 
                                      updatePermission(user.user_id, section.key as keyof UserPermissionState, checked)
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {filteredUsers?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No users found</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* By Pages Tab */}
        <TabsContent value="pages" className="mt-4">
          <ScrollArea className="h-[550px] pr-4">
            {renderSectionAccordion(PAGE_SECTIONS, 'pages')}
          </ScrollArea>
        </TabsContent>

        {/* By Capabilities Tab */}
        <TabsContent value="capabilities" className="mt-4">
          <ScrollArea className="h-[550px] pr-4">
            {renderSectionAccordion(CAPABILITY_SECTIONS, 'capabilities')}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
