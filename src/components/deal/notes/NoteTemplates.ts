export interface NoteTemplate {
  name: string;
  title: string;
  content: string;
  icon: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    name: 'kickoff_questions',
    title: 'Kick-Off Questions',
    icon: '🚀',
    content: `<h2>Deal Kick-Off Questions</h2>
<p><strong>Date:</strong> </p>
<p><strong>Client:</strong> </p>
<hr>
<ol>
<li><p><strong>What is the primary use of funds?</strong></p><p></p></li>
<li><p><strong>What is the target close date?</strong></p><p></p></li>
<li><p><strong>What is the existing debt structure?</strong></p><p></p></li>
<li><p><strong>What lenders have been approached?</strong></p><p></p></li>
<li><p><strong>What is the management team structure?</strong></p><p></p></li>
</ol>`,
  },
  {
    name: 'lender_call_notes',
    title: 'Lender Call Notes',
    icon: '🏦',
    content: `<h2>Lender Call Notes</h2>
<p><strong>Funding Source Name:</strong> </p>
<p><strong>Date:</strong> </p>
<hr>
<h3>Key Points Discussed</h3>
<ul><li></li></ul>
<h3>Follow-Up Actions</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div></div></li>
</ul>
<h3>Next Steps</h3>
<ul><li></li></ul>`,
  },
  {
    name: 'client_check_in',
    title: 'Client Check-In',
    icon: '✅',
    content: `<h2>Client Check-In</h2>
<p><strong>Date:</strong> </p>
<hr>
<h3>Topics Covered</h3>
<ul><li></li></ul>
<h3>Client Concerns</h3>
<ul><li></li></ul>
<h3>Action Items</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div></div></li>
</ul>`,
  },
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
<tr><th>Funding Source</th><th>Contact</th><th>Date Sent</th><th>Response</th><th>Status</th></tr>
<tr><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<h3>Notes</h3>
<p></p>`,
  },
];

/** Templates available only to 5th Line accounts. */
export const FIFTH_LINE_NOTE_TEMPLATES: NoteTemplate[] = [
  {
    name: 'pre_kickoff_qa_email',
    title: 'Pre-Kick Off Q&A Email',
    icon: '📨',
    content: `<h2>Pre-Kick Off Q&amp;A Email</h2>
<ul>
<li><p>How much of your revenue is generated within the US or Canada? How much outside the US and Canada?</p></li>
<li><p>Who is your law firm?</p></li>
<li><p>Who are your top 3 competitors?</p></li>
<li><p>How many customers do you currently have?</p></li>
<li><p>Any major concentration to be aware of?</p></li>
<li><p>Who is your bank?</p></li>
<li><p>What accounting system do you currently use?</p></li>
<li><p>Have you ever gone through an audit? If so, what years?</p></li>
<li><p>Are your financials CPA-Reviewed?</p></li>
<li><p>Who was the auditing firm?</p></li>
<li><p>Who's your accounting firm / CPA?</p></li>
<li><p>Is the CFO Full-time or contract?</p></li>
<li><p>Total headcount – including FTE and contractors</p></li>
<li><p>Is the headcount mostly located in the US?</p></li>
<li><p>Where is management located? (Country / State)</p></li>
<li><p>Is the software installed on customers premise or is it a cloud-based offering?</p></li>
<li><p>Please confirm what items are allocated to COGS in your financials</p></li>
<li><p>Total Capital Raised to Date (Equity &amp; Convertible Notes)</p></li>
<li><p>Most recent raise</p><ul><li><p>Amount, Valuation &amp; Structure</p></li></ul></li>
<li><p>How many board seats do you currently have?</p></li>
<li><p>How many are filled?</p></li>
<li><p>Who sits on the board?</p></li>
<li><p>What does a likely exit look like? Who's a likely acquirer? (Strategic, PE, etc.) – what sort of valuations have been discussed for an exit internally?</p></li>
</ul>
<h3>Revenue</h3>
<ul>
<li><p>*Walk me through the revenue streams, what they are and what the contract structure is with clients</p></li>
<li><p>*How do customers pay? Upfront, monthly, in arrears?</p></li>
<li><p>What are your typical contract structures (e.g., annual, multi-annual) and payment terms (e.g., monthly, annually)</p></li>
<li><p>Walk through any Flags from the analysis</p><ul><li><p></p></li></ul></li>
</ul>
<h3>The Raise</h3>
<ul>
<li><p>*Have you run a debt process at all in the past couple of years, with non-bank lenders? As in, have lenders reviewed your information at all over the past couple of years? If so, who were they?</p></li>
<li><p>Is Management and the board all on the same page with regards to exploring debt?</p></li>
<li><p>*What is the true GOALs in the financing? Insurance, preserve equity – cost? Flexibility? – it allows us to be most targeted in our reviews</p></li>
<li><p>*What is the breakdown of use of funds? (est.)</p></li>
</ul>
<h3>The Company &amp; the Market</h3>
<ul>
<li><p>When you lose a client, either a lost sale or a lost account, what is the typical reason?</p></li>
<li><p>When you win against competitors, what is the primary reason you win?</p></li>
<li><p>Pass me all of the relevant contact information for folks in your company</p></li>
</ul>
<h3>Cap Structure &amp; Investors</h3>
<ul>
<li><p>*Do investors have appetite to fund the company in additional rounds?</p></li>
<li><p>*Do the investors have the ability to fund the company if needed?</p></li>
</ul>
<h3>Customers</h3>
<ul>
<li><p>*Walk through any Flags from the analysis</p><ul><li><p></p></li></ul></li>
</ul>
<h3>Finance &amp; Metrics</h3>
<ul>
<li><p>*Who is your bank?</p><ul><li><p>Do you need a referral?</p></li></ul></li>
<li><p>*What are the primary KPI's you track for the business?</p><ul><li><p>Are they improving?</p></li></ul></li>
<li><p>*How long have you been with the company?</p></li>
<li><p>*In a downside scenario, which expenses (if any) can the company reduce to reach breakeven?</p></li>
<li><p>*Do you have a pipeline that supports your projections?</p></li>
<li><p>*Walk me through any seasonality to your sales cycles</p></li>
<li><p>Walk through any Flags from the analysis</p><ul><li><p></p></li></ul></li>
</ul>
<h3>Tech Kick off Questions</h3>
<ul>
<li><p>Do customers pay a fixed-fee or usage-based fee?</p></li>
<li><p>Are contracts annual? Multi-year? Monthly? If a mix, what's the rough mix?</p></li>
<li><p></p></li>
</ul>
<h3>Non-Tech Kick off Questions</h3>
<ul>
<li><p>*Any major customer concentration to be aware of, consistently throughout the year?</p></li>
<li><p>*What is your deposit &amp; payment schedule with your customers?</p></li>
<li><p>*Any challenges in collecting, historically?</p></li>
<li><p></p></li>
<li><p>INVENTORY what inventory system do you use?</p></li>
<li><p>INVENTORY What is the typically turnover time for your inventory?</p></li>
<li><p>INVENTORY What is the standard contract length/structure with your customers? What term?</p></li>
<li><p>*INVENTORY Have you ever had an inventory or equipment appraisal?</p></li>
<li><p>INVENTORY (if so) When was the most recent appraisal on your inventory or equipment?</p></li>
<li><p>INVENTORY Where are your vendors located? US or internationally? What's the rough breakdown in %</p></li>
<li><p>INVENTORY and your other payment terms with them?</p></li>
<li><p>INVENTORY Do you sell through any distributors to your customers? If so, how many distributors and what is the general breakdown of cash/revenue that flows through them?</p></li>
<li><p>INVENTORY How far out in your forecast provided is your revenue "locked in"? meaning you have either contracts or have worked with your customers on order schedules of some sort? Rough est. is fine</p></li>
</ul>`,
  },
];
