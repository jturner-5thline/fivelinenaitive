import { forwardRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgreementSection } from './types';
import { resolveTemplate, renderQualifierList } from './templateResolver';
import DOMPurify from 'dompurify';

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

interface Props {
  sections: AgreementSection[];
  values: Record<string, string>;
}

export const DrафterPreview = forwardRef<HTMLDivElement, Props>(({ sections, values }, ref) => {
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order);
  const companyShort = values['company_short'] || 'Company';

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
      </div>
      <ScrollArea className="flex-1">
        <div ref={ref} className="p-5 space-y-4">
          {/* Document Card */}
          <div className="bg-card/80 rounded-lg border p-6 space-y-5">
            {/* Title */}
            <h1 className="text-center text-sm font-bold uppercase tracking-wider">ADVISORY AGREEMENT</h1>

            {/* Sections */}
            {enabledSections.map((section, idx) => {
              const isExhibit = section.section_id.startsWith('exhibit_');
              const resolvedText = sanitize(resolveTemplate(section.template_text, values, true));

              return (
                <div key={section.section_id} data-section={section.section_id} className="transition-all rounded-md">
                  {isExhibit ? (
                    <div className="mt-6 pt-4 border-t">
                       <h3 className="text-center text-xs font-bold uppercase tracking-wider mb-3"
                        dangerouslySetInnerHTML={{ __html: resolvedText }}
                      />
                      {/* Render qualifier list */}
                      {section.qualifiers && section.qualifiers.length > 0 && (
                        <div className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-line"
                          dangerouslySetInnerHTML={{
                            __html: sanitize(resolveTemplate(
                              renderQualifierList(
                                section.qualifiers,
                                section.section_id === 'exhibit_a' ? 'exhibit_a' : 'exhibit_b',
                                values
                              ),
                              values,
                              true
                            ))
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div>
                      <div
                        className="text-[11px] leading-relaxed text-foreground/90"
                        dangerouslySetInnerHTML={{ __html: resolvedText }}
                      />
                      {/* Render subsections */}
                       {section.subsections && section.subsections.filter(s => s.enabled).map((sub, si) => (
                        <div key={sub.id} className="ml-4 mt-2 text-[11px] leading-relaxed text-foreground/80">
                          <span className="text-muted-foreground font-medium">({String.fromCharCode(105 + si)}) </span>
                          <span dangerouslySetInnerHTML={{ __html: sanitize(resolveTemplate(sub.template_text, values, true)) }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Signature Block */}
            <div className="mt-8 pt-6 border-t">
              <div className="grid grid-cols-2 gap-8">
                {['5th Line Capital Advisors LLC', companyShort].map(entity => (
                  <div key={entity} className="space-y-4">
                    <p className="text-xs font-bold">{entity}</p>
                    <p className="text-[10px] text-muted-foreground">Agreed to and Accepted:</p>
                    <div className="space-y-3 mt-3">
                      {['Name', 'Title', 'Date'].map(label => (
                        <div key={label}>
                          <div className="border-b border-muted-foreground/30 h-5" />
                          <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

DrафterPreview.displayName = 'DrафterPreview';
