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
    <section
      className="relative overflow-hidden flex items-center"
      style={{
        width: "100vw",
        marginLeft: "calc(50% - 50vw)",
        height: "72px",
        backgroundColor: "transparent",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)",
        maskImage:
          "linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)",
      }}
    >
      <div className="relative w-full">
        {/* Scrolling container */}
        <div className="flex items-center animate-scroll-left">
          {[...tags, ...tags, ...tags].map((tag, index) => (
            <div
              key={index}
              className="flex-shrink-0 px-5 py-2.5 mx-2 rounded-lg bg-gradient-to-b from-white/[0.04] to-white/[0.02] border border-white/10 text-white/75 text-sm font-medium tracking-tight whitespace-nowrap pointer-events-none backdrop-blur-sm"
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
