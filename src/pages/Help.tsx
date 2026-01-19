import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, HelpCircle, RotateCcw, PlayCircle, FileText, Shield } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FeatureWalkthrough, type FeatureGuide } from '@/components/help/FeatureWalkthrough';
import { featureGuides } from '@/data/featureWalkthroughs';

const faqs = [
  {
    question: 'How do I invite team members to my company?',
    answer: 'Go to the Company page and click "Invite Member". Enter their email address and select their role. They\'ll receive an email invitation to join your company.',
  },
  {
    question: 'Can I customize the deal stages?',
    answer: 'Yes! Navigate to Settings > Deal Stages to add, edit, reorder, or remove stages. Changes will apply to new deals and you can also update existing deals.',
  },
  {
    question: 'How do I export my deal data?',
    answer: 'From the Deals page, you can export deal data using the export options. For lender-specific data, use the export button on individual deal pages.',
  },
  {
    question: 'What happens when a milestone is overdue?',
    answer: 'Overdue milestones are highlighted in red on the deal page. You\'ll also receive notifications if you have milestone alerts enabled in your notification settings.',
  },
  {
    question: 'How do I flag a deal for attention?',
    answer: 'Click the flag icon on any deal card or deal detail page. You can add notes explaining why the deal is flagged. Flagged deals appear in the Flagged Deals widget on your dashboard.',
  },
  {
    question: 'Can I undo changes to a deal?',
    answer: 'All changes are logged in the Activity Timeline on each deal page. While there\'s no automatic undo, you can reference the activity log to see what changed and manually revert if needed.',
  },
  {
    question: 'How do I restart the guided tour?',
    answer: 'Click the "Restart Tour" button at the top of this page, or go to Settings and select "Restart Tour". This will reset the tour and hint tooltips.',
  },
  {
    question: 'What\'s the difference between Deal Manager and Deal Owner?',
    answer: 'The Deal Manager is typically the person actively working the deal day-to-day. The Deal Owner is often the senior person or relationship holder accountable for the deal\'s success.',
  },
  {
    question: 'How do I link emails to deals?',
    answer: 'First connect your Gmail in Integrations. Then when viewing any email, click "Link to Deal" to associate it with a specific deal. View linked emails in the deal\'s Emails tab.',
  },
];

export default function Help() {
  const [selectedGuide, setSelectedGuide] = useState<FeatureGuide | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);

  const handleRestartTour = () => {
    localStorage.removeItem('tour-completed');
    localStorage.removeItem('dismissed-hints');
    localStorage.removeItem('hints-fully-dismissed');
    sessionStorage.removeItem('demo-tour-shown-this-session');
    window.location.href = '/deals';
  };

  const handleOpenWalkthrough = (guide: FeatureGuide) => {
    setSelectedGuide(guide);
    setWalkthroughOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Help & Tips - nAItive</title>
        <meta name="description" content="Learn how to use the app effectively with tips and FAQs" />
      </Helmet>

      <div className="bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/deals">
              <ArrowLeft className="h-4 w-4" />
              Back to Deals
            </Link>
          </Button>

          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  Help & Tips
                </h1>
                <p className="text-muted-foreground">Learn how to use the app effectively</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRestartTour} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Restart Tour
              </Button>
            </div>

            {/* Quick Start */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  Quick Start Guide
                </CardTitle>
                <CardDescription>Get up and running in minutes</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-3 text-sm">
                  <li><strong>Create your first deal</strong> — Click "New Deal" in the header and enter the deal details.</li>
                  <li><strong>Add lenders</strong> — On the deal page, add lenders you're working with and track their progress.</li>
                  <li><strong>Track milestones</strong> — Use milestones to monitor deal progress and set due dates.</li>
                  <li><strong>Invite your team</strong> — Go to Company settings to invite colleagues and collaborate.</li>
                  <li><strong>Customize your workflow</strong> — Visit Settings to configure stages, deal types, and more.</li>
                </ol>
              </CardContent>
            </Card>

            {/* Feature Guides */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Feature Guides</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Click on any feature to start an interactive walkthrough.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featureGuides.map((guide) => (
                  <Card 
                    key={guide.title} 
                    className="hover:shadow-md transition-all cursor-pointer hover:border-primary/50 group"
                    onClick={() => handleOpenWalkthrough(guide)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <guide.icon className="h-4 w-4 text-primary" />
                          {guide.title}
                        </span>
                        <PlayCircle className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </CardTitle>
                      <CardDescription className="text-xs">{guide.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs space-y-1.5 text-muted-foreground">
                        {guide.tips.slice(0, 3).map((tip, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-primary">•</span>
                            <span className="line-clamp-1">{tip}</span>
                          </li>
                        ))}
                        {guide.tips.length > 3 && (
                          <li className="text-primary text-xs font-medium">
                            + {guide.tips.length - 3} more tips
                          </li>
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* FAQs */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Frequently Asked Questions</h2>
              <Card>
                <CardContent className="pt-6">
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, index) => (
                      <AccordionItem key={index} value={`faq-${index}`}>
                        <AccordionTrigger className="text-left text-sm">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground text-sm">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </div>

            {/* Legal Links */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Legal Information
                </CardTitle>
                <CardDescription>Review our policies and terms</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/privacy">
                      <Shield className="h-4 w-4 mr-2" />
                      Privacy Policy
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/terms">
                      <FileText className="h-4 w-4 mr-2" />
                      Terms of Service
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Contact Support */}
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <h3 className="font-medium">Still need help?</h3>
                  <p className="text-sm text-muted-foreground">
                    Contact your administrator or reach out to our support team for assistance.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button variant="outline" size="sm" asChild>
                      <a href="mailto:support@5thline.com">
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Email Support
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Walkthrough Dialog */}
      <FeatureWalkthrough
        guide={selectedGuide}
        open={walkthroughOpen}
        onOpenChange={setWalkthroughOpen}
      />
    </>
  );
}
