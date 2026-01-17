import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsOfService() {
  return (
    <>
      <Helmet>
        <title>Terms of Service | nAItive</title>
        <meta name="description" content="Terms of Service for nAItive - Read our terms and conditions for using our deal analysis platform." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12 max-w-4xl">
          <Link to="/">
            <Button variant="ghost" className="mb-8">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 17, 2026</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                Welcome to nAItive. By accessing or using our deal analysis platform and related services (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                These Terms constitute a legally binding agreement between you and nAItive ("Company," "we," "us," or "our"). We may modify these Terms at any time, and such modifications will be effective immediately upon posting. Your continued use of the Service constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                nAItive provides a modern deal analysis platform designed for growth-stage and lower-middle-market investors. Our Service includes deal tracking, lender management, analytics, collaboration tools, and related features. We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">To use certain features of the Service, you must create an account. You agree to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Provide accurate, current, and complete information during registration</li>
                <li>Maintain and promptly update your account information</li>
                <li>Maintain the security of your password and account credentials</li>
                <li>Accept responsibility for all activities that occur under your account</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                You must be at least 18 years old to create an account and use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Subscription and Payment</h2>
              
              <h3 className="text-xl font-medium mt-6 mb-3">4.1 Fees</h3>
              <p className="text-muted-foreground leading-relaxed">
                Certain features of the Service require a paid subscription. You agree to pay all applicable fees as described on our pricing page. All fees are non-refundable unless otherwise stated.
              </p>

              <h3 className="text-xl font-medium mt-6 mb-3">4.2 Billing</h3>
              <p className="text-muted-foreground leading-relaxed">
                Subscriptions are billed in advance on a monthly or annual basis. You authorize us to charge your payment method for all fees incurred. If payment fails, we may suspend or terminate your access to the Service.
              </p>

              <h3 className="text-xl font-medium mt-6 mb-3">4.3 Cancellation</h3>
              <p className="text-muted-foreground leading-relaxed">
                You may cancel your subscription at any time through your account settings. Cancellation will take effect at the end of your current billing period. No refunds will be provided for partial periods.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Use the Service for any unlawful purpose or in violation of any laws</li>
                <li>Infringe on the intellectual property rights of others</li>
                <li>Upload or transmit viruses, malware, or other malicious code</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use automated systems to access the Service without permission</li>
                <li>Collect or harvest user data without consent</li>
                <li>Impersonate any person or entity</li>
                <li>Share your account credentials with third parties</li>
                <li>Use the Service to compete with nAItive</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. User Content</h2>
              
              <h3 className="text-xl font-medium mt-6 mb-3">6.1 Ownership</h3>
              <p className="text-muted-foreground leading-relaxed">
                You retain ownership of all content you submit to the Service ("User Content"). By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, store, and process your User Content solely to provide the Service to you.
              </p>

              <h3 className="text-xl font-medium mt-6 mb-3">6.2 Responsibility</h3>
              <p className="text-muted-foreground leading-relaxed">
                You are solely responsible for your User Content and the consequences of posting it. You represent that you have all necessary rights to submit your User Content and that it does not violate any third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service and its original content, features, and functionality are owned by nAItive and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the Service without our express written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Confidentiality</h2>
              <p className="text-muted-foreground leading-relaxed">
                We understand that your deal and financial information is confidential. We will maintain the confidentiality of your data and will not disclose it to third parties except as required to provide the Service, as authorized by you, or as required by law. Our data handling practices are described in our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground leading-relaxed">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                The Service provides tools for deal analysis and management but does not constitute financial, legal, or investment advice. You are solely responsible for your investment decisions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, NAITIVE AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify, defend, and hold harmless nAItive and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising out of or related to your use of the Service, your User Content, or your violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease. You may terminate your account at any time through your account settings.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                Provisions that by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">13. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved in the state or federal courts located in Delaware.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">14. Dispute Resolution</h2>
              <p className="text-muted-foreground leading-relaxed">
                Before initiating any legal proceeding, you agree to first contact us and attempt to resolve the dispute informally. If we cannot resolve the dispute within 30 days, either party may proceed with formal legal action.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">15. General Provisions</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and nAItive regarding the Service.</li>
                <li><strong>Severability:</strong> If any provision of these Terms is found unenforceable, the remaining provisions will remain in effect.</li>
                <li><strong>Waiver:</strong> Our failure to enforce any right or provision shall not constitute a waiver of such right or provision.</li>
                <li><strong>Assignment:</strong> You may not assign these Terms without our prior written consent. We may assign our rights without restriction.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">16. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="font-medium">nAItive</p>
                <p className="text-muted-foreground">Email: legal@naitive.com</p>
                <p className="text-muted-foreground">Support: support@naitive.com</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
