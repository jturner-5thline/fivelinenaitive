import React from 'react';
import { Briefcase, ListTodo, Bell, Calendar, CalendarDays, Mail, Activity, Newspaper, BarChart3, Bot, Zap, MessageSquare, Clock, Phone, Inbox, Users, MousePointerClick, Eye, Linkedin, ThumbsUp, Radar } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { lazyRetry } from '@/lib/lazyRetry';

export interface WidgetDefinition {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'core' | 'intelligence' | 'activity' | 'brand-awareness' | 'custom';
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  component: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
}

// Lazy-load widget components
const MyDealsWidget = React.lazy(lazyRetry(() => import('./MyDealsWidget').then(m => ({ default: m.MyDealsWidget }))));
const MyTasksWidget = React.lazy(lazyRetry(() => import('./MyTasksWidget').then(m => ({ default: m.MyTasksWidget }))));
const EmailIntelligenceWidget = React.lazy(lazyRetry(() => import('./EmailIntelligenceWidget').then(m => ({ default: m.EmailIntelligenceWidget }))));
const NotificationCarousel = React.lazy(lazyRetry(() => import('./NotificationCarousel').then(m => ({ default: m.NotificationCarousel }))));
const WorkflowSuggestionsWidget = React.lazy(lazyRetry(() => import('./WorkflowSuggestionsWidget').then(m => ({ default: m.WorkflowSuggestionsWidget }))));
const AgentSuggestionsWidget = React.lazy(lazyRetry(() => import('./AgentSuggestionsWidget').then(m => ({ default: m.AgentSuggestionsWidget }))));
const DashboardAIInput = React.lazy(lazyRetry(() => import('./DashboardAIInput').then(m => ({ default: m.DashboardAIInput }))));
const NewsFeedWidget = React.lazy(lazyRetry(() => import('../deals/NewsFeedWidget').then(m => ({ default: m.NewsFeedWidget }))));
const RecentActivityWidget = React.lazy(lazyRetry(() => import('./RecentActivityWidget')));
const CustomFilterWidget = React.lazy(lazyRetry(() => import('./CustomFilterWidget')));
const WeeklyHoursWidget = React.lazy(lazyRetry(() => import('./WeeklyHoursWidget').then(m => ({ default: m.WeeklyHoursWidget }))));
const SalesCallPrepWidget = React.lazy(lazyRetry(() => import('./SalesCallPrepWidget').then(m => ({ default: m.SalesCallPrepWidget }))));
const ExpectedThisWeekWidget = React.lazy(lazyRetry(() => import('./ExpectedThisWeekWidget').then(m => ({ default: m.ExpectedThisWeekWidget }))));
const RequestBatchingWidget = React.lazy(lazyRetry(() => import('./RequestBatchingWidget').then(m => ({ default: m.RequestBatchingWidget }))));

// Brand Awareness placeholders (data source coming soon)
const WebsiteUsersWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.WebsiteUsersWidget }))));
const SeoClicksWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.SeoClicksWidget }))));
const SeoImpressionsWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.SeoImpressionsWidget }))));
const LinkedInImpressionsWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.LinkedInImpressionsWidget }))));
const LinkedInInteractionsWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.LinkedInInteractionsWidget }))));
const AiSearchReadinessScoreWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.AiSearchReadinessScoreWidget }))));
const MarketAwarenessScoreWidget = React.lazy(lazyRetry(() => import('./BrandAwarenessWidgets').then(m => ({ default: m.MarketAwarenessScoreWidget }))));

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'my-deals': {
    type: 'my-deals',
    label: 'My Deals',
    description: 'Active deals with search, filters, status notes, and lender hover cards',
    icon: Briefcase,
    category: 'core',
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 3, h: 3 },
    component: MyDealsWidget,
  },
  'my-tasks': {
    type: 'my-tasks',
    label: 'My Tasks',
    description: 'Milestones and tasks scoped to your deals with Mine/Team toggle',
    icon: ListTodo,
    category: 'core',
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 3, h: 3 },
    component: MyTasksWidget,
  },
  'sales-call-prep': {
    type: 'sales-call-prep',
    label: 'Sales Call Prep',
    description: 'Today\'s calls with AI-generated pre-call briefings and talking points',
    icon: Phone,
    category: 'intelligence',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 3 },
    component: SalesCallPrepWidget,
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
  'weekly-hours': {
    type: 'weekly-hours',
    label: 'Weekly Hours',
    description: 'Log time spent on each active deal this week',
    icon: Clock,
    category: 'core',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    component: WeeklyHoursWidget,
  },
  'expected-this-week': {
    type: 'expected-this-week',
    label: 'Expected This Week',
    description: 'Milestones and pending items due this week across your deals',
    icon: CalendarDays,
    category: 'core',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3, h: 3 },
    component: ExpectedThisWeekWidget,
  },
  'request-batching': {
    type: 'request-batching',
    label: 'Request Batching',
    description: 'Batch client requests and approve email drafts before sending',
    icon: Inbox,
    category: 'core',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3, h: 3 },
    component: RequestBatchingWidget,
  },
  'website-users': {
    type: 'website-users',
    label: 'Website Users',
    description: 'Unique visitors to your site',
    icon: Users,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: WebsiteUsersWidget,
  },
  'seo-clicks': {
    type: 'seo-clicks',
    label: 'SEO Clicks',
    description: 'Clicks from organic search results',
    icon: MousePointerClick,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: SeoClicksWidget,
  },
  'seo-impressions': {
    type: 'seo-impressions',
    label: 'SEO Impressions',
    description: 'Times you appeared in organic search',
    icon: Eye,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: SeoImpressionsWidget,
  },
  'linkedin-impressions': {
    type: 'linkedin-impressions',
    label: 'LinkedIn Impressions',
    description: 'Views of your LinkedIn content',
    icon: Linkedin,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: LinkedInImpressionsWidget,
  },
  'linkedin-interactions': {
    type: 'linkedin-interactions',
    label: 'LinkedIn Interactions',
    description: 'Reactions, comments, and shares on LinkedIn',
    icon: ThumbsUp,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: LinkedInInteractionsWidget,
  },
  'ai-search-readiness-score': {
    type: 'ai-search-readiness-score',
    label: 'AI Search Readiness Score',
    description: 'Rankscale — visibility across AI search engines',
    icon: Sparkles,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: AiSearchReadinessScoreWidget,
  },
  'market-awareness-score': {
    type: 'market-awareness-score',
    label: 'Market Awareness Score',
    description: 'Composite score across brand awareness signals',
    icon: Radar,
    category: 'brand-awareness',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    component: MarketAwarenessScoreWidget,
  },
};

export function getWidgetsByCategory() {
  const categories: Record<string, WidgetDefinition[]> = {
    core: [],
    intelligence: [],
    activity: [],
    'brand-awareness': [],
    custom: [],
  };
  Object.values(WIDGET_REGISTRY).forEach(w => {
    categories[w.category].push(w);
  });
  return categories;
}
