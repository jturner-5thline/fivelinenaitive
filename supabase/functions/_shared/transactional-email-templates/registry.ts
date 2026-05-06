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

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-to-naitive': welcomeToNaitive,
  'task-assigned': taskAssigned,
  'daily-briefing-ready': dailyBriefingReady,
  'qir-mention': qirMention,
}
