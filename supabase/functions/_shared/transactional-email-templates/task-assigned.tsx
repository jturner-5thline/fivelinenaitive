/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "naitive"
const PLATFORM_URL = "https://fivelinenaitive.lovable.app"

interface TaskAssignedProps {
  assigneeName?: string
  taskTitle?: string
  dealName?: string
  assignedByName?: string
  dueDate?: string
  taskUrl?: string
}

const TaskAssignedEmail = (props: TaskAssignedProps) => {
  const { assigneeName, taskTitle, dealName, assignedByName, dueDate, taskUrl } = props
  const h = React.createElement

  return h(Html, { lang: "en", dir: "ltr" },
    h(Head, null),
    h(Preview, null, `New task assigned: ${taskTitle || 'Untitled task'}`),
    h(Body, { style: main },
      h(Container, { style: container },
        h(Section, { style: logoSection },
          h(Text, { style: logoText }, "naitive")
        ),
        h(Hr, { style: divider }),
        h(Heading, { style: h1Style },
          assigneeName ? `Hey ${assigneeName},` : 'Hey,'
        ),
        h(Text, { style: text },
          assignedByName
            ? `${assignedByName} assigned you a new task:`
            : "You've been assigned a new task:"
        ),
        h(Section, { style: taskCard },
          h(Text, { style: taskTitleStyle }, taskTitle || 'Untitled task'),
          dealName ? h(Text, { style: metaText }, `Deal: ${dealName}`) : null,
          dueDate ? h(Text, { style: metaText }, `Due: ${dueDate}`) : null
        ),
        h(Section, { style: buttonSection },
          h(Button, { style: button, href: taskUrl || PLATFORM_URL + '/tasks' }, "View Task")
        ),
        h(Hr, { style: divider }),
        h(Text, { style: footer }, `— The ${SITE_NAME} team`)
      )
    )
  )
}

export const template = {
  component: TaskAssignedEmail,
  subject: (data: Record<string, any>) =>
    `Task assigned: ${data?.taskTitle || 'New task'}`,
  displayName: 'Task assigned notification',
  previewData: {
    assigneeName: 'Niki',
    taskTitle: 'Follow up with Acme Corp',
    dealName: 'Acme Corp',
    assignedByName: 'James Turner',
    dueDate: 'April 15, 2026',
    taskUrl: 'https://fivelinenaitive.lovable.app/tasks?task=123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '560px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoText = { fontSize: '20px', fontWeight: '700' as const, color: '#0f172a', letterSpacing: '-0.5px', margin: '0' }
const divider = { borderColor: '#e2e8f0', margin: '24px 0' }
const h1Style = { fontSize: '24px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const taskCard = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '0 0 24px',
}
const taskTitleStyle = { fontSize: '16px', fontWeight: '600' as const, color: '#0f172a', margin: '0 0 8px' }
const metaText = { fontSize: '13px', color: '#64748b', margin: '0 0 4px', lineHeight: '1.4' }
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
