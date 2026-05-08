/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "naitive"

interface DemoInviteProps {
  name?: string
  companyName?: string
  inviterName?: string
  acceptUrl?: string
  trialEndsAt?: string
  role?: string
}

const DemoInviteEmail = ({ name, companyName, inviterName, acceptUrl, trialEndsAt, role }: DemoInviteProps) => {
  const url = acceptUrl || 'https://fivelinenaitive.lovable.app'
  const trialLine = trialEndsAt
    ? `Your pilot access runs through ${new Date(trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : null
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {inviterName ? `${inviterName} invited you` : 'You have been invited'} to try {SITE_NAME}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>naitive</Text>
          </Section>
          <Hr style={divider} />
          <Heading style={h1}>
            {name ? `${name}, you're invited to ${SITE_NAME}` : `You're invited to ${SITE_NAME}`}
          </Heading>
          <Text style={text}>
            {inviterName ? `${inviterName} has set up` : 'We have set up'} a pilot workspace for
            {' '}<strong>{companyName || 'your team'}</strong> on the {SITE_NAME} platform — an AI-native
            command center for deal management, lender intelligence, and financial operations.
          </Text>
          {role ? (
            <Text style={text}>
              You'll join as <strong>{role}</strong> with full access to deals, the lender directory,
              VDR, and analytics.
            </Text>
          ) : null}
          <Section style={buttonSection}>
            <Button style={button} href={url}>
              Accept your invite
            </Button>
          </Section>
          <Text style={smallText}>
            Or copy this link: {url}
          </Text>
          {trialLine ? (
            <Section style={trialBox}>
              <Text style={trialText}>{trialLine}</Text>
            </Section>
          ) : null}
          <Hr style={divider} />
          <Text style={footer}>
            Questions? Just reply to this email.<br />
            — The {SITE_NAME} team
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DemoInviteEmail,
  subject: (data: Record<string, any>) =>
    data?.companyName
      ? `Your ${SITE_NAME} pilot for ${data.companyName} is ready`
      : `You're invited to try ${SITE_NAME}`,
  displayName: 'Demo / pilot invite',
  previewData: {
    name: 'Jane',
    companyName: 'Acme Capital',
    inviterName: 'James Turner',
    acceptUrl: 'https://fivelinenaitive.lovable.app/accept-invite?token=preview',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    role: 'Admin',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1 = { fontSize: '24px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const buttonSection = { textAlign: 'center' as const, margin: '32px 0 16px' }
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
const smallText = { fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 16px', textAlign: 'center' as const }
const trialBox = { backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '14px 18px', margin: '20px 0' }
const trialText = { fontSize: '13px', color: '#334155', margin: '0', lineHeight: '1.5' }
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0', lineHeight: '1.6' }