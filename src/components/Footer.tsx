import { Button } from "./ui/button";
import {
  MapPin,
  Phone,
  Mail,
  Linkedin,
  Instagram,
  ArrowRight
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { subscribeToNewsletter } from "../services/newsletterBackend";
import logo from "../assets/logo.png";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleSubscribe = async () => {
    if (!email) {
      setMessage('Please enter your email.');
      return;
    }
    setIsSubscribing(true);
    setMessage('');
    try {
      const res = await subscribeToNewsletter(email, 'footer');
      setMessage(res.success ? (res.message || 'Subscribed successfully!') : (res.message || 'Subscription failed.'));
      if (res.success) {
        setName('');
        setEmail('');
      }
    } catch {
      setMessage('Subscription failed. Please try again.');
    } finally {
      setIsSubscribing(false);
    }
  };

  type FooterLink = { name: string; to: string; external?: boolean };

  const productLinks: FooterLink[] = [
    { name: "Access Control Systems", to: "/products/access-control" },
    { name: "Barrier Gates", to: "/products/barrier-gates" },
    { name: "Pedestrian Gates", to: "/products/pedestrian-gates" },
    { name: "Parking Management", to: "/products/parking-management" },
  ];

  const solutionLinks: FooterLink[] = [
    { name: "ANPR Technology", to: "/solutions/anpr-technology" },
    { name: "Cloud Platform", to: "/solutions/cloud-platform" },
    { name: "Analytics & Reporting", to: "/solutions/analytics-reporting" },
    { name: "Revenue Management", to: "/solutions/revenue-management" },
  ];

  const companyLinks: FooterLink[] = [
    { name: "About Us", to: "/about" },
    { name: "Services", to: "/services" },
    { name: "Features", to: "/features" },
    { name: "Contact", to: "/contact" },
  ];

  const phoneNumbers = [
    { label: "Landline", number: "+91 720 724 4344", wa: "917207244344" },
    { label: "Mobile", number: "+91 9154703116", wa: "919154703116" },
    { label: "Mobile", number: "+91 7013799462", wa: "917013799462" },
  ];

  const socialLinks = [
    { icon: <Linkedin className="h-4 w-4" />, href: "https://www.linkedin.com/company/vayaccess", name: "LinkedIn" },
    { icon: <Instagram className="h-4 w-4" />, href: "https://www.instagram.com/vayaccess?igsh=MWd3MmNvODk2NTZpNw==", name: "Instagram" },
  ];

  const renderLink = (link: FooterLink) => {
    const className = "text-sm text-gray-300 hover:text-white transition-colors duration-200";
    if (link.external) {
      return <a href={link.to} target="_blank" rel="noopener noreferrer" className={className}>{link.name}</a>;
    }
    return <Link to={link.to} className={className}>{link.name}</Link>;
  };

  return (
    <footer className="bg-gradient-to-b from-gray-900 to-gray-950 text-white">
      {/* Main Footer */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12">
          {/* Brand + Contact */}
          <div className="lg:col-span-5 space-y-6">
            <Link to="/" className="inline-flex items-center gap-3 group">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 p-1 ring-1 ring-white/10 transition-transform group-hover:scale-105">
                <img src={logo} alt="VayAccess" className="w-full h-full object-contain" />
              </div>
              <div className="leading-tight">
                <div className="text-xl font-bold">VayAccess</div>
                <div className="text-xs text-gray-400">Smart Access. Safer Future.</div>
              </div>
            </Link>

            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Industry-leading parking and access control solutions — engineered in Hyderabad, deployed across India.
            </p>

            {/* Address */}
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="h-4 w-4 text-tech-blue-light mt-0.5 flex-shrink-0" />
              <div className="text-gray-300 leading-relaxed">
                <p className="font-medium text-white mb-0.5">Corporate Office</p>
                <p>Plot No. 26, Road No. 1, West Gandhi Nagar,</p>
                <p>Rampally X Road, Nagaram, Keesara (M),</p>
                <p>Hyderabad - 500083, Telangana, India</p>
              </div>
            </div>

            {/* Phone numbers */}
            <div className="flex items-start gap-3 text-sm">
              <Phone className="h-4 w-4 text-tech-blue-light mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-1">
                {phoneNumbers.map((p) => (
                  <a
                    key={p.wa}
                    href={`https://wa.me/${p.wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-300 hover:text-white transition-colors"
                    title={`Chat on WhatsApp: ${p.number}`}
                  >
                    <span className="text-gray-500 mr-1">{p.label}</span>{p.number}
                  </a>
                ))}
              </div>
            </div>

            {/* Email */}
            <a href="mailto:info@vayaccess.com" className="flex items-center gap-3 text-sm text-gray-300 hover:text-white transition-colors w-fit">
              <Mail className="h-4 w-4 text-tech-blue-light" />
              info@vayaccess.com
            </a>

            {/* Social Links */}
            <div className="flex items-center gap-3 pt-2">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:ring-white/20 transition-all"
                  aria-label={link.name}
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Products */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Products</h3>
            <ul className="space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.to}>{renderLink(link)}</li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Solutions</h3>
            <ul className="space-y-2.5">
              {solutionLinks.map((link) => (
                <li key={link.to}>{renderLink(link)}</li>
              ))}
            </ul>
          </div>

          {/* Company + Newsletter */}
          <div className="lg:col-span-3 space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Company</h3>
              <ul className="space-y-2.5">
                {companyLinks.map((link) => (
                  <li key={link.to}>{renderLink(link)}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Newsletter</h3>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                Get product updates and announcements in your inbox.
              </p>
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubscribing}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-tech-blue-light focus:bg-white/10 transition disabled:opacity-50"
                />
                <Button
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-sm font-semibold py-2 rounded-lg transition disabled:opacity-50"
                >
                  {isSubscribing ? 'Subscribing...' : 'Subscribe'}
                  {!isSubscribing && <ArrowRight className="ml-2 h-3.5 w-3.5" />}
                </Button>
                {message && (
                  <p className="text-xs text-tech-blue-light mt-1">{message}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-xs text-gray-500">
              © {currentYear} VayAccess Control Systems. All rights reserved.
            </div>
            <div className="flex items-center gap-5 text-xs text-gray-500">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/cookies" className="hover:text-white transition-colors">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;