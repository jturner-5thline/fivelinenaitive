/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcomeToNaitive } from './welcome-to-naitive.tsx'
import { template as taskAssigned } from './task-assigned.tsx'
import { template as dailyBriefingReady } from './daily-briefing-ready.tsx'
import { template as qirMention } from './qir-mention.tsx'
import { template as demoInvite } from './demo-invite.tsx'
import { template as demoTrialWarning } from './demo-trial-warning.tsx'
import { template as demoRequest } from './demo-request.tsx'
import { template as insightsReportReady } from './insights-report-ready.tsx'
import { template as endOfDayBriefingReady } from './end-of-day-briefing-ready.tsx'
import { template as partnerTierChanged } from './partner-tier-changed.tsx'
import { template as claapQuotaAlert } from './claap-quota-alert.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-to-naitive': welcomeToNaitive,
  'task-assigned': taskAssigned,
  'daily-briefing-ready': dailyBriefingReady,
  'qir-mention': qirMention,
  'demo-invite': demoInvite,
  'demo-trial-warning': demoTrialWarning,
  'demo-request': demoRequest,
  'insights-report-ready': insightsReportReady,
  'end-of-day-briefing-ready': endOfDayBriefingReady,
  'partner-tier-changed': partnerTierChanged,
  'claap-quota-alert': claapQuotaAlert,
}
