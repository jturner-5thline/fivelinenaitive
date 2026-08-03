/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'naitive'
const PLATFORM_URL = 'https://fivelinenaitive.lovable.app'

interface Props {
  alertType?: 'threshold' | 'rate_limited'
  callsMade?: number
  dailyLimit?: number
  percentUsed?: number
  usageDate?: string
  lastCallAt?: string
  last429At?: string
  resetAt?: string
}

const ClaapQuotaAlertEmail = (props: Props) => {
  const h = React.createElement
  const {
    alertType = 'threshold', callsMade, dailyLimit, percentUsed,
    usageDate, lastCallAt, last429At, resetAt,
  } = props

  const isRateLimited = alertType === 'rate_limited'
  const headline = isRateLimited
    ? 'Claap API returned a rate limit (429)'
    : 'Claap API usage passed 80% of the daily limit'
  const lead = isRateLimited
    ? 'Claap has started rejecting requests for today. Low-priority syncs are now deferred until the quota resets.'
    : 'naitive has used more than 80% of the Claap daily call allowance. Protect mode is active and low-priority syncs are being deferred.'

  const rows = [
    ['Usage date (UTC)', usageDate],
    ['Calls made', typeof callsMade === 'number' ? String(callsMade) : undefined],
    ['Daily limit', typeof dailyLimit === 'number' ? String(dailyLimit) : undefined],
    ['Percent used', typeof percentUsed === 'number' ? `${percentUsed}%` : undefined],
    ['Last call at', lastCallAt],
    ['First/last 429', last429At],
    ['Quota resets at', resetAt],
  ] as const

  return h(Html, { lang: 'en', dir: 'ltr' },
    h(Head, null),
    h(Preview, null, headline),
    h(Body, { style: main },
      h(Container, { style: container },
        h(Section, { style: logoSection }, h(Text, { style: logoText }, 'naitive')),
        h(Hr, { style: divider }),
        h(Heading, { style: h1Style }, headline),
        h(Text, { style: text }, lead),
        h(Section, { style: isRateLimited ? cardAlert : card },
          h(Text, { style: cardTitle }, 'Quota snapshot'),
          ...rows
            .filter(([, v]) => !!v)
            .map(([labelText, v]) =>
              h(Text, { style: metaText, key: labelText as string },
                `${labelText}: `, h('span', { style: bold }, String(v))
              )
            ),
        ),
        h(Section, { style: buttonSection },
          h(Button, { style: button, href: `${PLATFORM_URL}/admin/api-usage` }, 'View API Usage')
        ),
        h(Hr, { style: divider }),
        h(Text, { style: footer }, `— The ${SITE_NAME} team`)
      )
    )
  )
}

export const template = {
  component: ClaapQuotaAlertEmail,
  subject: (data: Record<string, any>) =>
    data?.alertType === 'rate_limited'
      ? 'Claap API rate limited (429) — syncs deferred'
      : `Claap API usage at ${data?.percentUsed ?? 80}% of daily limit`,
  displayName: 'Claap API quota alert',
  previewData: {
    alertType: 'threshold',
    callsMade: 812,
    dailyLimit: 1000,
    percentUsed: 81,
    usageDate: '2026-08-03',
    lastCallAt: 'Aug 3, 2026 · 2:41 PM UTC',
    resetAt: 'Aug 4, 2026 · 12:00 AM UTC',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1Style = { fontSize: '24px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const bold = { color: '#0f172a', fontWeight: 600 as const }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '0 0 24px',
}
const cardAlert = { ...card, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }
const cardTitle = { fontSize: '13px', fontWeight: 600 as const, color: '#0f172a', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }
const metaText = { fontSize: '13px', color: '#475569', margin: '0 0 4px', lineHeight: '1.5' }
const buttonSection = { textAlign: 'center' as const, margin: '8px 0 16px' }
const button = {
  backgroundColor: '#0f172a',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0' }
