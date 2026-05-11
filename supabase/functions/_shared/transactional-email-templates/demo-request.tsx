/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface DemoRequestProps {
  workEmail?: string
  submittedAt?: string
}

const DemoRequestEmail = (props: DemoRequestProps) => {
  const { workEmail, submittedAt } = props
  const h = React.createElement
  return h(Html, { lang: 'en', dir: 'ltr' },
    h(Head, null),
    h(Preview, null, `New naitive demo request from ${workEmail || 'a visitor'}`),
    h(Body, { style: main },
      h(Container, { style: container },
        h(Section, { style: { textAlign: 'center', marginBottom: 8 } as any },
          h(Text, { style: logoText }, 'naitive'),
        ),
        h(Hr, { style: divider }),
        h(Heading, { style: h1Style }, 'New naitive Demo Request'),
        h(Text, { style: text }, 'A new naitive demo request was submitted.'),
        h(Section, { style: card },
          h(Text, { style: row }, h('strong', null, 'Submitted email: '), workEmail || '—'),
          h(Text, { style: row }, h('strong', null, 'Requested demo: '), 'Yes'),
          h(Text, { style: row }, h('strong', null, 'Source: '), 'public naitive landing page'),
          h(Text, { style: row }, h('strong', null, 'Submitted at: '), submittedAt || new Date().toISOString()),
        ),
        h(Text, { style: text }, 'Please follow up to coordinate the demo.'),
        h(Hr, { style: divider }),
        h(Text, { style: footer }, '— naitive'),
      ),
    ),
  )
}

export const template = {
  component: DemoRequestEmail,
  subject: 'New naitive Demo Requests',
  displayName: 'Demo request (landing page)',
  to: 'ppina@5thline.co',
  previewData: {
    workEmail: 'prospect@example.com',
    submittedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1Style = { fontSize: '22px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const card = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', margin: '0 0 24px' }
const row = { fontSize: '14px', color: '#0f172a', margin: '0 0 8px', lineHeight: '1.5' }
const footer = { fontSize: '13px', color: '#94a3b8', margin: '0' }