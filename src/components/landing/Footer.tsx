import { BarChart3, Linkedin, Twitter } from "lucide-react";
import { Logo } from "@/components/Logo";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Security", href: "/login" },
    { label: "Integrations", href: "/login" },
  ],
  company: [
    { label: "About", href: "#about" },
    { label: "Careers", href: "mailto:careers@5thline.com" },
    { label: "Blog", href: "/login" },
    { label: "Press", href: "mailto:press@5thline.com" },
  ],
  resources: [
    { label: "Documentation", href: "/login" },
    { label: "API Reference", href: "/login" },
    { label: "Help Center", href: "/login" },
    { label: "Contact", href: "mailto:support@5thline.com" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/login" },
    { label: "Terms of Service", href: "/login" },
    { label: "Cookie Policy", href: "/login" },
  ],
};

export const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <a href="/" className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-accent-foreground" />
              </div>
              <Logo />
            </a>
            <p className="text-primary-foreground/60 text-sm leading-relaxed mb-6 max-w-xs">
              The modern deal analysis platform for growth-stage and lower-middle-market investors.
            </p>
            <div className="flex gap-4">
              <a
                href="https://linkedin.com/company/5thline"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a
                href="https://twitter.com/5thline"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-primary-foreground/10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-primary-foreground/60">
              © 2024 nAItive. All rights reserved.
            </p>
            <p className="text-sm text-primary-foreground/60">
              SOC 2 Type II Certified • GDPR Compliant
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
