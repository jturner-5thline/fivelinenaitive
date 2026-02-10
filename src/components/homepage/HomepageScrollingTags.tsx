const tags = [
  "Deal Pipeline Tracking",
  "Lender Management",
  "Data Room Organization",
  "Milestone Tracking",
  "AI Research Assistant",
  "Document Analysis",
  "Meeting Prep",
  "Company Profiles",
  "Market Intelligence",
  "Workflow Automation",
  "Team Collaboration",
  "Custom Reports",
];

export const HomepageScrollingTags = () => {
  return (
    <section className="py-6 bg-[#0a0a12] overflow-hidden">
      <div className="relative">
        {/* Gradient masks */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#0a0a12] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#0a0a12] to-transparent z-10" />
        
        {/* Scrolling container */}
        <div className="flex animate-scroll-left">
          {[...tags, ...tags, ...tags].map((tag, index) => (
            <div
              key={index}
              className="flex-shrink-0 px-5 py-2.5 mx-2 rounded-full bg-gradient-to-b from-[hsl(280,40%,20%,0.3)] to-[hsl(260,30%,12%,0.3)] border border-[hsl(280,60%,45%,0.4)] text-white/80 text-sm whitespace-nowrap pointer-events-none shadow-[0_0_8px_hsl(280,60%,45%,0.1)]"
            >
              {tag}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .animate-scroll-left {
          animation: scroll-left 30s linear infinite;
        }
      `}</style>
    </section>
  );
};
