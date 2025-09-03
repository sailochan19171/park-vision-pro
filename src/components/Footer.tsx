import { Button } from "./ui/button";
import { 
  MapPin, 
  Phone, 
  Mail, 
  Facebook, 
  Twitter, 
  Linkedin, 
  Youtube,
  ArrowRight
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { subscribeToNewsletter } from "../services/newsletterBackend";
import logo from "../assets/logo.png";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<'hourly'|'daily'|'weekly'>("weekly");
  const [message, setMessage] = useState("");
  const [articles, setArticles] = useState<{ title: string; description?: string; image?: string; type: 'product'|'solution'; }[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Auto-rotate articles every 3 seconds
  useEffect(() => {
    // Fetch available articles from backend (public, no auth; only shows public content)
    fetch('/api/content/articles')
      .then(r => r.json())
      .then(data => {
        if (data?.success && Array.isArray(data.articles)) setArticles(data.articles);
      })
      .catch(() => {});

    // start rotation
    intervalRef.current = window.setInterval(() => {
      setActiveIndex((i) => (articles.length ? (i + 1) % articles.length : 0));
    }, 3000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [articles.length]);

  const handleSubscribe = async () => {
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, frequency })
      });
      const json = await res.json().catch(() => ({ success:false, message:'Invalid response' }));
      if (res.ok && json.success) {
        setMessage('Subscribed successfully!');
        setName('');
        setEmail('');
        setFrequency('weekly');
      } else {
        setMessage(json.message || 'Subscription failed.');
      }
    } catch (error) {
      setMessage('Subscription failed. Please try again.');
    }
  };

  const footerLinks = {
    solutions: [
      { name: "Smart Turnstiles", href: "#solutions" },
      { name: "Security Systems", href: "#solutions" },
      { name: "Mobile Solutions", href: "#solutions" },
      { name: "Analytics Dashboard", href: "#solutions" }
    ],
    // products: [
    //   { name: "ParkGate Pro X1", href: "#products" },
    //   { name: "SmartBarrier Elite", href: "#products" },
    //   { name: "ParkVision Dashboard", href: "#products" },
    //   { name: "PayPark Mobile", href: "#products" }
    // ],
    support: [
      { name: "Documentation", href: "#" },
      { name: "API Reference", href: "#" },
      { name: "Support Center", href: "#" },
      { name: "Training", href: "#" }
    ],
    company: [
      { name: "About Us", href: "#about" },
      { name: "Careers", href: "#" },
      { name: "News & Events", href: "#" },
      { name: "Partners", href: "#" }
    ]
  };

  const socialLinks = [
    { icon: <Facebook className="h-5 w-5" />, href: "#", name: "Facebook" },
    { icon: <Twitter className="h-5 w-5" />, href: "#", name: "Twitter" },
    { icon: <Linkedin className="h-5 w-5" />, href: "#", name: "LinkedIn" },
    { icon: <Youtube className="h-5 w-5" />, href: "#", name: "YouTube" }
  ];

  return (
    <footer className="bg-tech-gray text-white">
      {/* Main Footer */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid lg:grid-cols-5 md:grid-cols-3 gap-8">
          {/* Company Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-lg overflow-hidden">
                <img src={logo} alt="VayAccess Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-2xl font-bold">VayAccess Parking Solutions</span>
            </div>
            
            <p className="text-gray-300 max-w-md">
              Leading provider of smart parking solutions, access control systems, and traffic management 
              technologies. Making parking smarter, safer, and more convenient worldwide.
            </p>

            {/* Contact Info */}
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <MapPin className="h-5 w-5 text-tech-blue-light mt-1" />
                <div className="text-sm text-white font-white font-semibold">
                  <p>Plot No. 26, Road No.1, West Gandhi Nagar</p>
                  <p>Hyderabad - 500083, TS, India</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="h-5 w-5 text-tech-blue-light" />
                <span className="text-sm text-gray-300">+91 720 724 4344</span>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-tech-blue-light" />
                <span className="text-sm text-gray-300">info@vayaccess.com</span>
              </div>
            </div>

            {/* Social Links removed as requested */}
          </div>

          {/* Solutions */}
          <div>
            <h3 className="font-bold text-lg mb-4">Solutions</h3>
            <ul className="space-y-3">
              {footerLinks.solutions.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-tech-blue-light transition-colors duration-300"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Products */}
          <div>
            <h3 className="font-bold text-lg mb-4">Products</h3>
            <ul className="space-y-3">
              {(footerLinks.products || []).map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-tech-blue-light transition-colors duration-300"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support & Company */}
          <div>
            <h3 className="font-bold text-lg mb-4">Support</h3>
            <ul className="space-y-3 mb-6">
              {footerLinks.support.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-tech-blue-light transition-colors duration-300"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>

            <h3 className="font-bold text-lg mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-tech-blue-light transition-colors duration-300"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Newsletter & Live Articles Carousel for subscribers */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-xl font-bold mb-2">Stay Updated</h3>
              <p className="text-gray-300">
                Subscribe to our newsletter for the latest products and solutions. Subscribers receive automated, image-rich articles by email.
              </p>
              {/* Live rotating preview of available products/solutions */}
              {articles.length > 0 && (
                <div className="mt-6 bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-sm text-gray-300 mb-3">Live products & solutions (auto-rotates every 3s)</div>
                  {articles.slice(activeIndex, activeIndex + 1).map((a, i) => (
                    <div key={`${a.title}-${i}`} className="flex items-start space-x-4">
                      {a.image ? (
                        <img src={a.image} alt={a.title} className="w-20 h-20 object-cover rounded-md border border-white/10" />
                      ) : (
                        <div className="w-20 h-20 rounded-md bg-white/10" />
                      )}
                      <div>
                        <div className="text-white font-semibold leading-tight">{a.title}</div>
                        <div className="text-gray-300 text-sm line-clamp-3 mt-1">{a.description}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-wide text-tech-blue-light">{a.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-tech-blue-light"
                />
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-tech-blue-light"
                />
                <div className="flex items-center md:justify-end gap-4 text-sm">
                  {(['hourly','daily','weekly'] as const).map((f) => (
                    <label key={f} className="inline-flex items-center gap-1">
                      <input type="radio" name="frequency" value={f} checked={frequency===f} onChange={() => setFrequency(f)} />
                      <span className="capitalize">{f}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex space-x-4">
                <Button onClick={handleSubscribe} className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
                  Subscribe
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          {message && (
            <div className="text-sm text-green-400 mt-3">{message}</div>
          )}
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-sm text-gray-400">
              Copyright © {currentYear} VayAccess Control Systems - All Rights Reserved.
            </div>
            
            <div className="flex space-x-6 text-sm">
              <a href="#" className="text-gray-400 hover:text-tech-blue-light transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-400 hover:text-tech-blue-light transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-gray-400 hover:text-tech-blue-light transition-colors">
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;