/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'naitive'
const PLATFORM_URL = 'https://fivelinenaitive.lovable.app'

interface Props {
  partnerName?: string
  fromTier?: number | null
  toTier?: number
  qualifiedTrailing3mo?: number
  signedTrailing3mo?: number
  addedToBoardTrailing12mo?: number
  totalDeals?: number
  changedAt?: string
  partnerUrl?: string
}

const label = (t?: number | null) => (t == null ? '—' : `Tier ${t}`)

const PartnerTierChangedEmail = (props: Props) => {
  const h = React.createElement
  const {
    partnerName, fromTier, toTier,
    qualifiedTrailing3mo, signedTrailing3mo, addedToBoardTrailing12mo, totalDeals,
    changedAt, partnerUrl,
  } = props

  const metrics = [
    ['Qualified deals (trailing 3mo)', qualifiedTrailing3mo],
    ['Signed clients (trailing 3mo)', signedTrailing3mo],
    ['Deals on board (trailing 12mo)', addedToBoardTrailing12mo],
    ['Total attributed deals', totalDeals],
  ] as const

  return h(Html, { lang: 'en', dir: 'ltr' },
    h(Head, null),
    h(Preview, null, `${partnerName || 'A partner'} moved ${label(fromTier)} → ${label(toTier)}`),
    h(Body, { style: main },
      h(Container, { style: container },
        h(Section, { style: logoSection },
          h(Text, { style: logoText }, 'naitive')
        ),
        h(Hr, { style: divider }),
        h(Heading, { style: h1Style }, 'Partner tier updated'),
        h(Text, { style: text },
          `${partnerName || 'A partner'} was automatically moved from `,
          h('span', { style: bold }, label(fromTier)),
          ' to ',
          h('span', { style: bold }, label(toTier)),
          '.'
        ),
        h(Section, { style: card },
          h(Text, { style: cardTitle }, 'Thresholds at time of change'),
          ...metrics
            .filter(([, v]) => typeof v === 'number')
            .map(([labelText, v]) =>
              h(Text, { style: metaText, key: labelText as string },
                `${labelText}: `, h('span', { style: bold }, String(v))
              )
            ),
          changedAt ? h(Text, { style: metaText }, `Changed at: `, h('span', { style: bold }, changedAt)) : null,
        ),
        h(Section, { style: buttonSection },
          h(Button, { style: button, href: partnerUrl || `${PLATFORM_URL}/partners-pipeline` }, 'View Partner')
        ),
        h(Hr, { style: divider }),
        h(Text, { style: footer }, `— The ${SITE_NAME} team`)
      )
    )
  )
}

export const template = {
  component: PartnerTierChangedEmail,
  subject: (data: Record<string, any>) =>
    `Partner tier updated: ${data?.partnerName || 'partner'} → ${label(data?.toTier)}`,
  displayName: 'Partner tier auto-change notification',
  previewData: {
    partnerName: 'Dorian Meza @ Truist Bank',
    fromTier: 3,
    toTier: 2,
    qualifiedTrailing3mo: 2,
    signedTrailing3mo: 0,
    addedToBoardTrailing12mo: 5,
    totalDeals: 6,
    changedAt: 'Jul 24, 2026 · 3:15 PM',
    partnerUrl: 'https://fivelinenaitive.lovable.app/partners-pipeline',
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