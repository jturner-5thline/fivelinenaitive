export interface NoteTemplate {
  name: string;
  title: string;
  content: string;
  icon: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    name: 'call_notes',
    title: 'Call Notes',
    icon: '📞',
    content: `<h2>Call Notes</h2>
<p><strong>Date:</strong> </p>
<p><strong>Attendees:</strong> </p>
<p><strong>Duration:</strong> </p>
<hr>
<h3>Agenda</h3>
<ul><li></li></ul>
<h3>Key Discussion Points</h3>
<ul><li></li></ul>
<h3>Action Items</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div></div></li>
</ul>
<h3>Next Steps</h3>
<ul><li></li></ul>`,
  },
  {
    name: 'dd_summary',
    title: 'Due Diligence Summary',
    icon: '🔍',
    content: `<h2>Due Diligence Summary</h2>
<p><strong>Company:</strong> </p>
<p><strong>Date:</strong> </p>
<p><strong>Analyst:</strong> </p>
<hr>
<h3>Executive Summary</h3>
<p></p>
<h3>Financial Overview</h3>
<table><tr><th>Metric</th><th>Current</th><th>Prior Year</th><th>Notes</th></tr><tr><td>Revenue</td><td></td><td></td><td></td></tr><tr><td>EBITDA</td><td></td><td></td><td></td></tr><tr><td>Net Income</td><td></td><td></td><td></td></tr></table>
<h3>Strengths</h3>
<ul><li></li></ul>
<h3>Risks & Concerns</h3>
<ul><li></li></ul>
<h3>Recommendation</h3>
<p></p>`,
  },
  {
    name: 'term_sheet',
    title: 'Term Sheet Comparison',
    icon: '📋',
    content: `<h2>Term Sheet Comparison</h2>
<p><strong>Deal:</strong> </p>
<p><strong>Date:</strong> </p>
<hr>
<table>
<tr><th>Term</th><th>Lender A</th><th>Lender B</th><th>Lender C</th></tr>
<tr><td>Amount</td><td></td><td></td><td></td></tr>
<tr><td>Rate</td><td></td><td></td><td></td></tr>
<tr><td>Term</td><td></td><td></td><td></td></tr>
<tr><td>Fees</td><td></td><td></td><td></td></tr>
<tr><td>Covenants</td><td></td><td></td><td></td></tr>
<tr><td>Collateral</td><td></td><td></td><td></td></tr>
</table>
<h3>Analysis</h3>
<p></p>
<h3>Recommendation</h3>
<p></p>`,
  },
  {
    name: 'meeting_minutes',
    title: 'Meeting Minutes',
    icon: '📝',
    content: `<h2>Meeting Minutes</h2>
<p><strong>Date:</strong> </p>
<p><strong>Attendees:</strong> </p>
<p><strong>Location:</strong> </p>
<hr>
<h3>Agenda</h3>
<ol><li></li></ol>
<h3>Discussion</h3>
<p></p>
<h3>Decisions Made</h3>
<ul><li></li></ul>
<h3>Action Items</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div></div></li>
</ul>`,
  },
  {
    name: 'lender_outreach',
    title: 'Lender Outreach Tracker',
    icon: '🏦',
    content: `<h2>Lender Outreach Tracker</h2>
<p><strong>Deal:</strong> </p>
<p><strong>Target Close:</strong> </p>
<hr>
<table>
<tr><th>Lender</th><th>Contact</th><th>Date Sent</th><th>Response</th><th>Status</th></tr>
<tr><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<h3>Notes</h3>
<p></p>`,
  },
];
