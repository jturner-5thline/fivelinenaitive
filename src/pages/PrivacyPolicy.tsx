import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | nAItive</title>
        <meta name="description" content="Privacy Policy for nAItive - Learn how we collect, use, and protect your personal information." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12 max-w-4xl">
          <Link to="/">
            <Button variant="ghost" className="mb-8">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 17, 2026</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                nAItive ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our deal analysis platform and related services (the "Service").
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                By accessing or using the Service, you agree to this Privacy Policy. If you do not agree with the terms of this Privacy Policy, please do not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-medium mt-6 mb-3">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Account Information:</strong> Name, email address, company name, job title, and password when you create an account.</li>
                <li><strong>Deal Information:</strong> Details about deals, lenders, companies, and financial information you enter into the platform.</li>
                <li><strong>Communication Data:</strong> Emails, support tickets, and feedback you send us.</li>
                <li><strong>Payment Information:</strong> Billing details processed through our secure payment providers.</li>
              </ul>

              <h3 className="text-xl font-medium mt-6 mb-3">2.2 Automatically Collected Information</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and interaction patterns.</li>
                <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers.</li>
                <li><strong>Cookies:</strong> We use cookies and similar technologies to enhance your experience.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">We use the collected information to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process transactions and send related information</li>
                <li>Send administrative notifications, updates, and security alerts</li>
                <li>Respond to your comments, questions, and support requests</li>
                <li>Analyze usage patterns to enhance user experience</li>
                <li>Detect, prevent, and address technical issues and security threats</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Data Sharing and Disclosure</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">We may share your information in the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>With Your Consent:</strong> When you explicitly authorize sharing.</li>
                <li><strong>Service Providers:</strong> With third-party vendors who assist in operating our Service.</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
                <li><strong>Team Members:</strong> Within your organization's workspace as configured.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                We do not sell your personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard security measures to protect your data, including encryption in transit and at rest, access controls, and regular security audits. Our platform is SOC 2 Type II certified and GDPR compliant. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your personal information for as long as your account is active or as needed to provide you with the Service. We may retain certain information as required by law or for legitimate business purposes, such as resolving disputes and enforcing our agreements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">Depending on your location, you may have the following rights:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Access:</strong> Request a copy of your personal data.</li>
                <li><strong>Correction:</strong> Request correction of inaccurate data.</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data.</li>
                <li><strong>Portability:</strong> Request transfer of your data to another service.</li>
                <li><strong>Objection:</strong> Object to certain processing of your data.</li>
                <li><strong>Withdrawal:</strong> Withdraw consent where processing is based on consent.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                To exercise these rights, please contact us at privacy@naitive.com.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. International Data Transfers</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place for such transfers in compliance with applicable data protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected personal information from a child, we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Changes to This Privacy Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="font-medium">nAItive</p>
                <p className="text-muted-foreground">Email: privacy@naitive.com</p>
                <p className="text-muted-foreground">Support: support@naitive.com</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
