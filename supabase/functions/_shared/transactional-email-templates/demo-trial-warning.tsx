/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'naitive'

interface DemoTrialWarningProps {
  name?: string
  companyName?: string
  trialEndsAt?: string
  daysRemaining?: number
  contactEmail?: string
}

const DemoTrialWarningEmail = ({ name, companyName, trialEndsAt, daysRemaining, contactEmail }: DemoTrialWarningProps) => {
  const days = typeof daysRemaining === 'number' ? daysRemaining : 3
  const endsLine = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'soon'
  const mailto = `mailto:${contactEmail || 'team@naitive.co'}?subject=Continue%20${encodeURIComponent(companyName || 'our')}%20on%20${SITE_NAME}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Your ${SITE_NAME} pilot ends in ${days} day${days === 1 ? '' : 's'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}><Text style={logoText}>naitive</Text></Section>
          <Hr style={divider} />
          <Heading style={h1}>
            {name ? `${name}, your pilot ends in ${days} day${days === 1 ? '' : 's'}` : `Your pilot ends in ${days} day${days === 1 ? '' : 's'}`}
          </Heading>
          <Text style={text}>
            The {SITE_NAME} pilot for <strong>{companyName || 'your team'}</strong> is scheduled to end on
            {' '}<strong>{endsLine}</strong>. After that, your workspace will be paused and access removed
            until a plan is selected.
          </Text>
          <Text style={text}>
            If you'd like to continue using {SITE_NAME}, just reply to this email or reach out to our team —
            we'll walk you through plans and any extensions you need.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={mailto}>Continue with {SITE_NAME}</Button>
          </Section>
          <Hr style={divider} />
          <Text style={footer}>— The {SITE_NAME} team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DemoTrialWarningEmail,
  subject: (data: Record<string, any>) => {
    const days = typeof data?.daysRemaining === 'number' ? data.daysRemaining : 3
    return `Your ${SITE_NAME} pilot ends in ${days} day${days === 1 ? '' : 's'}`
  },
  displayName: 'Demo trial expiry warning',
  previewData: {
    name: 'Jane',
    companyName: 'Acme Capital',
    trialEndsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    daysRemaining: 3,
    contactEmail: 'team@naitive.co',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1 = { fontSize: '24px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const buttonSection = { textAlign: 'center' as const, margin: '28px 0 8px' }
const button = {
  backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const,
  padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0', lineHeight: '1.6' }