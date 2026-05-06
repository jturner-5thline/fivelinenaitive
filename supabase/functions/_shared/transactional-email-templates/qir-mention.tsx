/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'naitive'
const PLATFORM_URL = 'https://fivelinenaitive.lovable.app'

interface QirMentionProps {
  recipientName?: string
  authorName?: string
  reportLabel?: string
  targetLabel?: string
  body?: string
  url?: string
}

const QirMentionEmail = (props: QirMentionProps) => {
  const { recipientName, authorName, reportLabel, targetLabel, body, url } = props
  const h = React.createElement
  return h(Html, { lang: 'en', dir: 'ltr' },
    h(Head, null),
    h(Preview, null, `${authorName || 'Someone'} mentioned you in ${reportLabel || 'the Insights Report'}`),
    h(Body, { style: main },
      h(Container, { style: container },
        h(Section, { style: { textAlign: 'center', marginBottom: 8 } as any },
          h(Text, { style: logoText }, 'naitive'),
        ),
        h(Hr, { style: divider }),
        h(Heading, { style: h1Style }, recipientName ? `Hey ${recipientName},` : 'Hey,'),
        h(Text, { style: text }, `${authorName || 'A teammate'} mentioned you in a comment on ${reportLabel || 'the Insights Report'}${targetLabel ? ` — ${targetLabel}` : ''}.`),
        h(Section, { style: card },
          h(Text, { style: bodyText }, body || ''),
        ),
        h(Section, { style: { textAlign: 'center', margin: '8px 0 16px' } as any },
          h(Button, { style: button, href: url || PLATFORM_URL + '/insights' }, 'View Comment'),
        ),
        h(Hr, { style: divider }),
        h(Text, { style: footer }, `— The ${SITE_NAME} team`),
      ),
    ),
  )
}

export const template = {
  component: QirMentionEmail,
  subject: (data: Record<string, any>) =>
    `${data?.authorName || 'Someone'} mentioned you in ${data?.reportLabel || 'the Insights Report'}`,
  displayName: 'Insights Report mention',
  previewData: {
    recipientName: 'Niki',
    authorName: 'James Turner',
    reportLabel: 'Quarterly Insights Report — Q1 2026',
    targetLabel: 'Revenue KPI',
    body: '@Niki Heikali can you confirm the revenue figure for March?',
    url: 'https://fivelinenaitive.lovable.app/insights',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1Style = { fontSize: '24px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const card = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', margin: '0 0 24px' }
const bodyText = { fontSize: '14px', color: '#0f172a', margin: 0, whiteSpace: 'pre-wrap' as const, lineHeight: '1.5' }
const button = { backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0' }