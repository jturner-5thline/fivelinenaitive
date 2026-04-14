/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "naitive"
const PLATFORM_URL = "https://fivelinenaitive.lovable.app"
const BRIEFING_URL = `${PLATFORM_URL}/dashboard?briefing=true&tab=catch-up-news`

interface DailyBriefingReadyProps {
  name?: string
  date?: string
}

const DailyBriefingReadyEmail = ({ name, date }: DailyBriefingReadyProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your daily briefing is ready — {date || 'today'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Text style={logoText}>naitive</Text>
        </Section>
        <Hr style={divider} />

        <Heading style={h1}>
          Good morning{name ? `, ${name}` : ''}.
        </Heading>

        <Text style={dateText}>
          {date || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </Text>

        <Text style={text}>
          Your daily briefing has been prepared and is ready to review.
        </Text>

        <Section style={buttonSection}>
          <Button style={button} href={BRIEFING_URL}>
            View Daily Briefing
          </Button>
        </Section>

        <Text style={smallText}>
          Or copy this link: {BRIEFING_URL}
        </Text>

        <Hr style={divider} />
        <Text style={footer}>
          — The naitive team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DailyBriefingReadyEmail,
  subject: 'Your Daily Briefing is Ready',
  displayName: 'Daily Briefing Ready',
  previewData: { name: 'James', date: 'Monday, April 14, 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1 = { fontSize: '26px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 8px', lineHeight: '1.3' }
const dateText = { fontSize: '14px', color: '#94a3b8', margin: '0 0 24px', fontWeight: '500' as const }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const buttonSection = { textAlign: 'center' as const, margin: '32px 0 16px' }
const button = {
  backgroundColor: '#0f172a',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '14px 32px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const smallText = { fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 16px', textAlign: 'center' as const }
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0' }
