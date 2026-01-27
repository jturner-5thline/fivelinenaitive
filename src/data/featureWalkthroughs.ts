import { Plus, Users, BarChart3, FileText, Settings, Bell, Flag, Building2, Workflow, Mail, Bot } from 'lucide-react';
import type { FeatureGuide } from '@/components/help/FeatureWalkthrough';

/**
 * Feature walkthrough definitions.
 * 
 * MAINTENANCE NOTE: Update these walkthroughs whenever the corresponding
 * feature's UI or workflow changes. Each guide should accurately reflect
 * the current user experience.
 * 
 * Last updated: 2026-01-17
 */

export const featureGuides: FeatureGuide[] = [
  {
    icon: Plus,
    title: 'Creating Deals',
    description: 'Start tracking your pipeline',
    tips: [
      'Click the "New Deal" button in the header to create a deal',
      'Enter the deal name, amount, and optionally assign a manager and owner',
      'Default milestones will be automatically added based on your settings',
      'Navigate to Settings > Default Milestones to customize what milestones are added to new deals',
    ],
    walkthrough: [
      {
        title: 'Open the New Deal dialog',
        description: 'Click the "New Deal" button in the top navigation header. You can do this from any page in the app.',
        action: 'Click "New Deal" button',
        tip: 'You can also use the keyboard shortcut to quickly create deals.',
      },
      {
        title: 'Enter deal information',
        description: 'Fill in the company name and deal value. The company name is required, while the value can be estimated.',
        action: 'Fill in Company and Value fields',
      },
      {
        title: 'Assign team members (optional)',
        description: 'Select a Deal Manager and Deal Owner from your team. The manager handles day-to-day work while the owner is accountable for success.',
        action: 'Select Manager and Owner dropdowns',
        tip: 'You can change these assignments later on the deal page.',
      },
      {
        title: 'Set deal type and referral source',
        description: 'Choose a deal type to categorize the deal and optionally add a referral source if someone referred this deal to you.',
        action: 'Configure additional options',
      },
      {
        title: 'Create the deal',
        description: 'Click "Create Deal" to save. Default milestones from your settings will be automatically added.',
        action: 'Click "Create Deal"',
        route: '/settings',
        tip: 'Customize default milestones in Settings > Default Milestones.',
      },
    ],
  },
  {
    icon: Flag,
    title: 'Deal Milestones',
    description: 'Track progress on each deal',
    tips: [
      'Each deal has milestones that help track progress toward closing',
      'Click on a milestone to mark it complete or set a due date',
      'Overdue milestones will be highlighted to help you stay on track',
      'Add custom milestones specific to each deal as needed',
    ],
    walkthrough: [
      {
        title: 'Navigate to a deal',
        description: 'From the Deals page, click on any deal card to open the deal detail view.',
        action: 'Click on a deal card',
        route: '/deals',
      },
      {
        title: 'View the Milestones section',
        description: 'On the deal page, find the Milestones section. It shows all milestones with their status and due dates.',
        action: 'Locate the Milestones panel',
      },
      {
        title: 'Mark a milestone complete',
        description: 'Click the checkbox next to any milestone to mark it as complete. A timestamp will be recorded.',
        action: 'Click milestone checkbox',
        tip: 'Completed milestones stay visible so you can track your progress history.',
      },
      {
        title: 'Set a due date',
        description: 'Click on a milestone to set or edit its due date. Overdue milestones will be highlighted in red.',
        action: 'Click to set due date',
      },
      {
        title: 'Add a custom milestone',
        description: 'Click the "Add Milestone" button to create milestones specific to this deal that aren\'t in your defaults.',
        action: 'Click "Add Milestone"',
        tip: 'Drag milestones to reorder them by priority.',
      },
    ],
  },
  {
    icon: Users,
    title: 'Managing Lenders',
    description: 'Track lender interactions',
    tips: [
      'Add lenders to each deal using the Lenders section on the deal page',
      'Drag and drop lenders between stages to update their status',
      'Add notes and quotes to each lender for easy reference',
      'Use substages for more granular tracking of lender progress',
    ],
    walkthrough: [
      {
        title: 'Open a deal\'s Lenders tab',
        description: 'Navigate to any deal and click on the "Lenders" tab to see all lenders associated with this deal.',
        action: 'Click "Lenders" tab',
        route: '/deals',
      },
      {
        title: 'Add a new lender',
        description: 'Click "Add Lender" and search for a lender from your master list, or create a new one by typing a name.',
        action: 'Click "Add Lender"',
        tip: 'Lenders from your master database will show suggestions as you type.',
      },
      {
        title: 'Update lender stage',
        description: 'Drag and drop lender cards between columns to move them through stages (Contacted, In Discussion, Term Sheet, etc.).',
        action: 'Drag lender to new stage',
      },
      {
        title: 'Add notes and quotes',
        description: 'Click on a lender card to expand it. Add notes about your conversations and record any quote details.',
        action: 'Click lender to expand',
        tip: 'Notes are timestamped and saved automatically.',
      },
      {
        title: 'Use substages for detail',
        description: 'Within each stage, you can assign substages for more granular tracking. Configure these in Settings.',
        action: 'Select substage from dropdown',
        route: '/settings',
      },
    ],
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Visualize your performance',
    tips: [
      'View charts and metrics on the Analytics page',
      'Customize widgets to show the data most relevant to you',
      'Track deal volume, conversion rates, and pipeline value over time',
      'Export analytics data for reporting purposes',
    ],
    walkthrough: [
      {
        title: 'Navigate to Analytics',
        description: 'Click "Analytics" in the sidebar to access your performance dashboard.',
        action: 'Click "Analytics" in sidebar',
        route: '/analytics',
      },
      {
        title: 'Review key metrics',
        description: 'The top cards show your most important numbers: active deals, pipeline value, conversion rates, and more.',
        action: 'Review stat cards',
      },
      {
        title: 'Explore the charts',
        description: 'Scroll down to see visual breakdowns of your pipeline by stage, deal type, and time periods.',
        action: 'View charts',
        tip: 'Hover over chart elements for detailed tooltips.',
      },
      {
        title: 'Customize your widgets',
        description: 'Click the edit/customize button to rearrange widgets or choose which metrics to display.',
        action: 'Click customize button',
      },
      {
        title: 'Filter by date range',
        description: 'Use the date picker to analyze performance over specific time periods.',
        action: 'Select date range',
      },
    ],
  },
  {
    icon: FileText,
    title: 'Reports',
    description: 'Generate professional reports',
    tips: [
      'Create custom reports using the Reports page',
      'Select deals and choose which information to include',
      'Export reports as PDF or Word documents',
      'Schedule automated reports to be sent via email',
    ],
    walkthrough: [
      {
        title: 'Go to Reports',
        description: 'Click "Reports" in the sidebar to access the report builder.',
        action: 'Click "Reports" in sidebar',
        route: '/reports',
      },
      {
        title: 'Choose report type',
        description: 'Select from preset report templates or start a custom report. Options include Pipeline Summary, Lender Activity, and more.',
        action: 'Select report type',
      },
      {
        title: 'Select deals to include',
        description: 'Filter and select which deals should be included in the report. You can filter by stage, owner, or date range.',
        action: 'Select deals',
      },
      {
        title: 'Configure report sections',
        description: 'Choose which information sections to include: deal details, lender summaries, milestones, activity logs, etc.',
        action: 'Toggle sections',
        tip: 'Preview your report before exporting to ensure it looks right.',
      },
      {
        title: 'Export or schedule',
        description: 'Download as PDF or Word, or set up automated delivery to receive reports on a schedule.',
        action: 'Click export or schedule',
      },
    ],
  },
  {
    icon: Building2,
    title: 'Company & Team',
    description: 'Collaborate with your team',
    tips: [
      'Create or join a company to collaborate with team members',
      'Invite team members via email from the Company settings',
      'Assign deals to specific team members for ownership',
      'View activity across all team members in the activity log',
    ],
    walkthrough: [
      {
        title: 'Access Company settings',
        description: 'Click on "Company" in the sidebar to manage your team and company settings.',
        action: 'Click "Company" in sidebar',
        route: '/company',
      },
      {
        title: 'Create or join a company',
        description: 'If you haven\'t already, create a new company or accept an invitation to join an existing one.',
        action: 'Create company or accept invite',
      },
      {
        title: 'Invite team members',
        description: 'Click "Invite Member" and enter their email address. Choose their role: Member, Admin, or Owner.',
        action: 'Click "Invite Member"',
        tip: 'Admins can manage settings and members. Owners have full control.',
      },
      {
        title: 'View team members',
        description: 'The Members tab shows everyone in your company, their roles, and when they joined.',
        action: 'Review team list',
      },
      {
        title: 'Collaborate on deals',
        description: 'Team members can now be assigned as Deal Managers or Owners, and everyone can see shared deals.',
        action: 'Assign team to deals',
      },
    ],
  },
  {
    icon: Workflow,
    title: 'Building Workflows',
    description: 'Create automated processes',
    tips: [
      'Use the Visual Builder for a drag-and-drop experience',
      'Start with the Workflow Assistant to quickly configure based on your goals',
      'Add conditions to make workflows run only when specific criteria are met',
      'Use delays to schedule actions for later execution',
    ],
    walkthrough: [
      {
        title: 'Start with the Assistant (optional)',
        description: 'Click "New Workflow" to open the Workflow Assistant. Answer questions about what you want to achieve, what should trigger it, and what should happen.',
        action: 'Click "New Workflow"',
        tip: 'The assistant will pre-configure your workflow based on your answers.',
      },
      {
        title: 'Choose your builder',
        description: 'Switch between Visual Builder (drag-and-drop nodes) or Classic View (form-based). Visual Builder is great for complex workflows with multiple steps.',
        action: 'Select builder tab',
      },
      {
        title: 'Add a trigger',
        description: 'In Visual Builder, drag a trigger from the palette (Deal Stage Change, New Deal, Scheduled, etc.). This defines when your workflow runs.',
        action: 'Drag trigger node',
        tip: 'You can only have one trigger per workflow.',
      },
      {
        title: 'Add actions',
        description: 'Drag action nodes like Send Notification, Send Email, or Call Webhook. Connect them in sequence to define what happens.',
        action: 'Add action nodes',
      },
      {
        title: 'Add logic (optional)',
        description: 'Use Condition nodes to add if/then branching, Filter nodes to process specific records, or Human Approval to pause for manual review.',
        action: 'Add logic nodes',
      },
      {
        title: 'Configure each node',
        description: 'Click any node to configure it in the right panel. Set trigger conditions, notification messages, webhook URLs, etc.',
        action: 'Click node to configure',
      },
      {
        title: 'Save and activate',
        description: 'Name your workflow, toggle it active, and click Save. The workflow will start running automatically when triggered.',
        action: 'Click "Save Workflow"',
        route: '/workflows',
      },
    ],
  },
  {
    icon: Workflow,
    title: 'Workflows',
    description: 'Automate repetitive tasks',
    tips: [
      'Create workflows to automate actions based on triggers',
      'Set up notifications when deals reach certain stages',
      'Automate milestone assignments based on deal type',
      'Configure email alerts for stale deals or missed milestones',
    ],
    walkthrough: [
      {
        title: 'Open Workflows',
        description: 'Navigate to "Workflows" in the sidebar to access the automation builder.',
        action: 'Click "Workflows" in sidebar',
        route: '/workflows',
      },
      {
        title: 'Create a new workflow',
        description: 'Click "New Workflow" to start building an automation. Give it a descriptive name.',
        action: 'Click "New Workflow"',
      },
      {
        title: 'Choose a trigger',
        description: 'Select what should start the workflow: deal stage changes, new deal created, milestone completed, etc.',
        action: 'Select trigger type',
        tip: 'You can add conditions to make triggers more specific.',
      },
      {
        title: 'Add actions',
        description: 'Define what happens when the trigger fires: send notifications, update fields, create tasks, etc.',
        action: 'Add workflow actions',
      },
      {
        title: 'Activate the workflow',
        description: 'Toggle the workflow on to make it active. You can pause it anytime without deleting.',
        action: 'Toggle workflow active',
        tip: 'Test workflows on a few deals before rolling out broadly.',
      },
    ],
  },
  {
    icon: Bell,
    title: 'Notifications',
    description: 'Stay informed',
    tips: [
      'Configure notification preferences in Account settings',
      'Choose which activities trigger in-app and email notifications',
      'Access all notifications from the bell icon in the header',
      'Enable weekly summary emails for a digest of activity',
    ],
    walkthrough: [
      {
        title: 'Access notification settings',
        description: 'Go to Account settings and find the Notifications section.',
        action: 'Navigate to Account > Notifications',
        route: '/account',
      },
      {
        title: 'Choose notification types',
        description: 'Toggle which activities you want to be notified about: deal updates, lender changes, milestones, etc.',
        action: 'Toggle notification types',
      },
      {
        title: 'Set delivery preferences',
        description: 'For each notification type, choose whether to receive it in-app, via email, or both.',
        action: 'Configure delivery method',
        tip: 'In-app notifications appear in real-time; emails may have a slight delay.',
      },
      {
        title: 'View notifications',
        description: 'Click the bell icon in the header to see all your notifications. Unread ones are highlighted.',
        action: 'Click bell icon',
      },
      {
        title: 'Enable weekly summaries',
        description: 'Turn on weekly summary emails to get a digest of all activity each week.',
        action: 'Enable weekly summary',
      },
    ],
  },
  {
    icon: Settings,
    title: 'Customization',
    description: 'Tailor the app to your workflow',
    tips: [
      'Customize deal stages in Settings > Deal Stages',
      'Configure lender stages and substages for your process',
      'Set up deal types to categorize your deals',
      'Manage pass reasons for when lenders decline',
    ],
    walkthrough: [
      {
        title: 'Open Settings',
        description: 'Click "Settings" in the sidebar to access all customization options.',
        action: 'Click "Settings" in sidebar',
        route: '/settings',
      },
      {
        title: 'Customize deal stages',
        description: 'In Deal Stages, add, rename, reorder, or remove stages to match your sales process.',
        action: 'Edit deal stages',
        tip: 'Changes apply to new deals. Existing deals keep their current stage.',
      },
      {
        title: 'Configure lender stages',
        description: 'Set up the stages lenders move through: Contacted, In Discussion, Term Sheet, Closed, Passed.',
        action: 'Edit lender stages',
      },
      {
        title: 'Add substages',
        description: 'Create substages within each lender stage for more detailed tracking.',
        action: 'Configure substages',
      },
      {
        title: 'Manage deal types & pass reasons',
        description: 'Set up deal type categories and reasons why lenders might pass on deals.',
        action: 'Configure deal types',
        tip: 'Consistent pass reasons help analyze patterns over time.',
      },
    ],
  },
  {
    icon: Mail,
    title: 'Email Integration',
    description: 'Connect and track emails',
    tips: [
      'Connect your Gmail account to view emails in the app',
      'Link emails to specific deals for correspondence tracking',
      'View all linked emails in the deal\'s Emails tab',
      'Compose and send emails directly from the app',
    ],
    walkthrough: [
      {
        title: 'Go to Integrations',
        description: 'Navigate to the Integrations page from the sidebar.',
        action: 'Click "Integrations" in sidebar',
        route: '/integrations',
      },
      {
        title: 'Connect Gmail',
        description: 'Click "Connect Gmail" and authorize access. Your emails will sync automatically.',
        action: 'Click "Connect Gmail"',
        tip: 'Only you can see your connected emails; they\'re not shared with teammates.',
      },
      {
        title: 'View your inbox',
        description: 'Once connected, you\'ll see your recent emails in the Gmail tab. Click any email to read it.',
        action: 'Browse inbox',
      },
      {
        title: 'Link an email to a deal',
        description: 'When viewing an email, click "Link to Deal" and select the relevant deal.',
        action: 'Click "Link to Deal"',
      },
      {
        title: 'View linked emails on deals',
        description: 'On any deal page, go to the "Emails" tab to see all correspondence linked to that deal.',
        action: 'Open deal\'s Emails tab',
        tip: 'Linked emails help keep a complete record of deal communications.',
      },
    ],
  },
  {
    icon: Bot,
    title: 'Building AI Agents',
    description: 'Create custom AI assistants',
    tips: [
      'Use the Workflow tab to build modular agents with drag-and-drop tools',
      'Start with a template to quickly configure common agent types',
      'Fine-tune agent behavior with personality and temperature settings',
      'Share agents with your team or make them public',
    ],
    walkthrough: [
      {
        title: 'Start with a template (optional)',
        description: 'Choose from Quick Start Templates like Deal Advisor, Lender Matcher, or Pipeline Coach to pre-fill common configurations.',
        action: 'Click a template button',
        tip: 'Templates set up the name, emoji, personality, and system prompt for you.',
      },
      {
        title: 'Build your workflow',
        description: 'In the Workflow tab, drag tools from the palette on the left into your agent. Choose from Data Sources, AI Models, Capabilities, Integrations, and Logic.',
        action: 'Drag tools to the canvas',
        tip: 'Each tool you add expands what your agent can do.',
      },
      {
        title: 'Configure each tool',
        description: 'Click on any tool in the workflow canvas to configure it. Set options like access levels, API endpoints, or model parameters.',
        action: 'Select a tool to configure',
      },
      {
        title: 'Define identity',
        description: 'Switch to the Identity tab to set your agent\'s name, avatar emoji, personality style, and system prompt.',
        action: 'Fill in Identity fields',
        tip: 'The system prompt is the core instruction that defines your agent\'s expertise.',
      },
      {
        title: 'Set permissions',
        description: 'Use the Permissions tab to control what data your agent can access: deals, lenders, activities, milestones.',
        action: 'Toggle permission switches',
      },
      {
        title: 'Adjust advanced settings',
        description: 'Fine-tune the temperature slider in Advanced tab. Lower values (0.3) give focused responses; higher values (0.9) are more creative.',
        action: 'Adjust temperature slider',
      },
      {
        title: 'Save your agent',
        description: 'Click "Create Agent" to save. Your agent will appear in your agents list and be ready to use.',
        action: 'Click "Create Agent"',
        route: '/agents',
      },
    ],
  },
];
