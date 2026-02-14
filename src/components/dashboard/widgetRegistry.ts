import React from 'react';
import { Briefcase, ListTodo, Bell, Calendar, Mail, Sparkles, Activity, Newspaper, BarChart3, Bot, Zap, MessageSquare } from 'lucide-react';

export interface WidgetDefinition {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'core' | 'intelligence' | 'activity' | 'custom';
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  component: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
}

// Lazy-load widget components
const MyDealsWidget = React.lazy(() => import('./MyDealsWidget').then(m => ({ default: m.MyDealsWidget })));
const MyTasksWidget = React.lazy(() => import('./MyTasksWidget').then(m => ({ default: m.MyTasksWidget })));
const KeyAlertsWidget = React.lazy(() => import('./KeyAlertsWidget').then(m => ({ default: m.KeyAlertsWidget })));
const MyDayWidget = React.lazy(() => import('./MyDayWidget').then(m => ({ default: m.MyDayWidget })));
const EmailIntelligenceWidget = React.lazy(() => import('./EmailIntelligenceWidget').then(m => ({ default: m.EmailIntelligenceWidget })));
const NotificationCarousel = React.lazy(() => import('./NotificationCarousel').then(m => ({ default: m.NotificationCarousel })));
const WorkflowSuggestionsWidget = React.lazy(() => import('./WorkflowSuggestionsWidget').then(m => ({ default: m.WorkflowSuggestionsWidget })));
const AgentSuggestionsWidget = React.lazy(() => import('./AgentSuggestionsWidget').then(m => ({ default: m.AgentSuggestionsWidget })));
const DashboardAIInput = React.lazy(() => import('./DashboardAIInput').then(m => ({ default: m.DashboardAIInput })));
const NewsFeedWidget = React.lazy(() => import('../deals/NewsFeedWidget').then(m => ({ default: m.NewsFeedWidget })));
const RecentActivityWidget = React.lazy(() => import('./RecentActivityWidget'));
const CustomFilterWidget = React.lazy(() => import('./CustomFilterWidget'));

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'my-deals': {
    type: 'my-deals',
    label: 'My Deals',
    description: 'Active deals where you are the manager with status notes and filters',
    icon: Briefcase,
    category: 'core',
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 3, h: 3 },
    component: MyDealsWidget,
  },
  'my-tasks': {
    type: 'my-tasks',
    label: 'My Tasks',
    description: 'Milestones and tasks grouped by deal or date with due-today filters',
    icon: ListTodo,
    category: 'core',
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 3, h: 3 },
    component: MyTasksWidget,
  },
  'key-alerts': {
    type: 'key-alerts',
    label: 'Key Alerts',
    description: 'Stale lenders, at-risk deals, and overdue milestones for your deals',
    icon: Bell,
    category: 'core',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    component: KeyAlertsWidget,
  },
  'my-day': {
    type: 'my-day',
    label: 'My Day',
    description: 'Today\'s calendar events with contact and deal context',
    icon: Calendar,
    category: 'core',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    component: MyDayWidget,
  },
  'email-intelligence': {
    type: 'email-intelligence',
    label: 'Email Intelligence',
    description: 'Smart email labeling suggestions and response detection',
    icon: Mail,
    category: 'intelligence',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    component: EmailIntelligenceWidget,
  },
  'ai-search': {
    type: 'ai-search',
    label: 'AI Search',
    description: 'Natural language search and navigation assistant',
    icon: Sparkles,
    category: 'intelligence',
    defaultSize: { w: 12, h: 3 },
    minSize: { w: 6, h: 2 },
    component: DashboardAIInput,
  },
  'notifications': {
    type: 'notifications',
    label: 'Notifications',
    description: 'Notification carousel with stale alerts, flex engagement, and activity',
    icon: Bell,
    category: 'activity',
    defaultSize: { w: 12, h: 5 },
    minSize: { w: 6, h: 4 },
    component: NotificationCarousel,
  },
  'workflow-suggestions': {
    type: 'workflow-suggestions',
    label: 'Workflow Suggestions',
    description: 'AI-suggested automations based on your behavior patterns',
    icon: Zap,
    category: 'intelligence',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    component: WorkflowSuggestionsWidget,
  },
  'agent-suggestions': {
    type: 'agent-suggestions',
    label: 'Agent Suggestions',
    description: 'Recommended AI agents based on your workflow',
    icon: Bot,
    category: 'intelligence',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    component: AgentSuggestionsWidget,
  },
  'news-feed': {
    type: 'news-feed',
    label: 'News Feed',
    description: 'Latest industry news from lenders and clients',
    icon: Newspaper,
    category: 'activity',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3, h: 3 },
    component: NewsFeedWidget,
  },
  'recent-activity': {
    type: 'recent-activity',
    label: 'Recent Activity',
    description: 'Latest deal activity across your portfolio',
    icon: Activity,
    category: 'activity',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3, h: 3 },
    component: RecentActivityWidget,
  },
  'custom-filter': {
    type: 'custom-filter',
    label: 'Custom View',
    description: 'Create a custom filtered view of your data',
    icon: BarChart3,
    category: 'custom',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3, h: 3 },
    component: CustomFilterWidget,
  },
};

export function getWidgetsByCategory() {
  const categories: Record<string, WidgetDefinition[]> = {
    core: [],
    intelligence: [],
    activity: [],
    custom: [],
  };
  Object.values(WIDGET_REGISTRY).forEach(w => {
    categories[w.category].push(w);
  });
  return categories;
}
