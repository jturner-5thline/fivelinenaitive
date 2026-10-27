const tags = ["Deal Workspace", "Deal AI", "Smarter Lender Matching", "Pipeline Visibility", "Relationship Intelligence", "Email-to-Deal Workflows", "Lender Tracking", "Connected Documents", "Workflow Automation"];

export const HomepageScrollingTags = () => (
  <section aria-label="Platform capabilities" className="os-marquee border-y border-border overflow-hidden py-5">
    <div className="os-marquee-track flex w-max">
      {[0, 1].map(copy => <div key={copy} aria-hidden={copy === 1 ? true : undefined} className="flex shrink-0 items-center gap-3 pr-3">
        {tags.map(tag => <span key={tag} className="flex items-center gap-3 whitespace-nowrap rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{tag}</span>)}
      </div>)}
    </div>
  </section>
);
