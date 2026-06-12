/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Naitive"
const PLATFORM_URL = "https://naitive.co"

interface WelcomeProps {
  name?: string
}

const WelcomeToNaitiveEmail = ({ name }: WelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your account is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Text style={logoText}>Naitive</Text>
        </Section>
        <Hr style={divider} />
        <Heading style={h1}>
          {name ? `Welcome, ${name}!` : `Welcome to ${SITE_NAME}!`}
        </Heading>
        <Text style={text}>
          Your account has been created and you have full admin access to the {SITE_NAME} platform.
        </Text>
        <Text style={text}>
          You can log in using your email and password to access deals, pipeline management, lender intelligence, and the full suite of tools.
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={PLATFORM_URL}>
            Access the Platform
          </Button>
        </Section>
        <Text style={smallText}>
          Or copy this link: {PLATFORM_URL}
        </Text>
        <Hr style={divider} />
        <Text style={footer}>
          — The {SITE_NAME} team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeToNaitiveEmail,
  subject: 'Welcome to Naitive — Your account is ready',
  displayName: 'Welcome to Naitive',
  previewData: { name: 'Jaritt' },
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
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0' }
