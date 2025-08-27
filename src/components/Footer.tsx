import { Button } from "./ui/button";
import { useState } from "react";
import { useToast } from "../hooks/use-toast";

import { subscribeToNewsletter } from "../services/newsletterBackend";
import { saveSubscriber } from "../services/newsletterService";
import { 
  MapPin, 
  Phone, 
  Mail, 
  // Facebook, 
  // Twitter, 
  // Linkedin, 
  // Youtube,
  ArrowRight
} from "lucide-react";
import logo from "../assets/vay-logo.jpg";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { toast } = useToast();
  const [email, setEmail] = useState('');

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Show loading state
      toast({
        title: "Processing Subscription...",
        description: "Please wait while we process your subscription.",
      });

      // Subscribe via backend: sends emails server-side (no CORS) and logs
      const resp = await subscribeToNewsletter(email, "footer");
      if (!resp.success) throw new Error(resp.message);

      // Optionally persist subscriber to Firestore for live update campaigns
      const shouldSaveSubscriber = (import.meta.env as any).VITE_ENABLE_FIRESTORE_SUBSCRIBER_SAVE === 'true';
      if (shouldSaveSubscriber) {
        try {
          await saveSubscriber(email, "footer");
        } catch (err) {
          console.warn('Failed to persist subscriber to Firestore (continuing):', err);
        }
      } else {
        console.info('Skipping Firestore subscriber persistence (VITE_ENABLE_FIRESTORE_SUBSCRIBER_SAVE!=true)');
      }

      // Auto-enable web push after successful subscription
      let notificationsEnabled = false;
      let lastPushToken: string | null = null;
      let pushError: string | null = null;
      try {
        const { enableWebPush } = await import("../services/pushService");
        const token = await enableWebPush((import.meta.env as any).VITE_FIREBASE_VAPID_KEY, email);
        console.log('FCM token:', token);
        notificationsEnabled = !!token;
        lastPushToken = token || null;
      } catch (err: any) {
        const msg = err?.message || String(err);
        pushError = msg;
        console.info('Web push permission/token step skipped or failed:', msg);
      }

      toast({
        title: "You're all set!",
        description: notificationsEnabled
          ? `Subscribed as ${email}. Notifications enabled. Token: ${lastPushToken?.slice(0, 12)}...`
          : pushError
            ? `Subscribed as ${email}. Notifications not enabled (${pushError}). You can enable notifications in your browser site settings.`
            : `Subscribed as ${email}. You can enable notifications later in your browser settings.`,
        duration: 6000,
      });
      
      setEmail('');
    } catch (error) {
      toast({
        title: "Subscription Failed",
        description: "There was an error subscribing. Please try again later.",
        variant: "destructive",
      });
    }
  };



  const footerLinks = {
    solutions: [
      { name: "Smart Turnstiles", href: "#solutions" },
      { name: "Security Systems", href: "#solutions" },
      { name: "Mobile Solutions", href: "#solutions" },
      { name: "Analytics Dashboard", href: "#solutions" },
      { name: "Find Nearby Parking", href: "/" } 

    ],
    products: [
      { name: "Access Control", href: "#products" },
      { name: "Barrier Gates", href: "#products" },
      // { name: "VayAccess Dashboard", href: "#products" },
      { name: "Parking Management", href: "#products" }
    ],
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

  // const socialLinks = [
  //   { icon: <Facebook className="h-5 w-5" />, href: "#", name: "Facebook" },
  //   { icon: <Twitter className="h-5 w-5" />, href: "#", name: "Twitter" },
  //   { icon: <Linkedin className="h-5 w-5" />, href: "#", name: "LinkedIn" },
  //   { icon: <Youtube className="h-5 w-5" />, href: "#", name: "YouTube" }
  // ];

  return (
    <footer className="bg-tech-gray text-white overflow-hidden">
      {/* Main Footer */}
      <div className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Company Info */}
          <div className="sm:col-span-2 lg:col-span-2 space-y-4 text-[14px]">
            <div className="flex items-center space-x-2">
              <img 
                src={logo} 
                alt="VayAccess Logo" 
                className="h-10 sm:h-12 w-auto"
              />
            </div>
            
            <p className="text-white max-w-md font-poppins font-normal text-sm">
              Smart parking and access control solutions.
            </p>

            {/* Contact Info */}
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300 mt-1 flex-shrink-0" />
                <div className="text-xs sm:text-sm text-white font-poppins font-semibold">
                  <p className="text-white font-semibold">Plot No. 26, Road No.1, West Gandhi Nagar, Rampally X Road, Nagaram, Keesara (M), </p>
                  <p className="text-white font-semibold">Hyderabad - 500083, TS, India</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-white font-poppins font-semibold">+91 915 470 3116</span>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-white font-poppins font-semibold">info@vayaccess.com</span>
              </div>
            </div>

            {/* Social Links */}
            {/* <div className="flex space-x-4"> */}
              {/* {socialLinks.map((social, index) => ( */}
                {/* <a */}
                  {/* key={index} */}
                  {/* href={social.href} */}
                  {/* className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-tech-blue transition-colors duration-300" */}
                  {/* aria-label={social.name} */}
                {/* > */}
                  {/* {social.icon} */}
                {/* </a> */}
              {/* ))} */}
            {/* </div> */}
          </div>

          {/* Solutions */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg mb-3 font-poppins">Solutions</h3>
            <ul className="space-y-2">
              {footerLinks.solutions.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-blue-400 transition-colors duration-300 font-poppins font-normal text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Products */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg mb-3 font-poppins">Products</h3>
            <ul className="space-y-2">
              {footerLinks.products.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-blue-400 transition-colors duration-300 font-poppins font-normal text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support & Company */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg mb-3 font-poppins">Support</h3>
            <ul className="space-y-2 mb-4">
              {footerLinks.support.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-blue-400 transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>

            <h3 className="font-bold text-lg mb-3">Company</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-gray-300 hover:text-blue-400 transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Newsletter */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start md:items-center">
            <div>
              <h3 className="text-lg font-bold mb-2">Stay Updated</h3>
              <p className="text-gray-300 text-sm">
                Subscribe to our newsletter for the latest parking technology insights and product updates.
              </p>
            </div>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 text-sm"
              />
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  className="bg-gradient-to-r from-tech-blue to-blue-400 hover:opacity-90 whitespace-nowrap"
                >
                  Subscribe
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 sm:px-6 py-4 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0">
            <div className="text-xs sm:text-sm text-gray-400 text-center md:text-left">
              Copyright © {currentYear} VAYACCESS CONTROL SYSTEMS - All Rights Reserved.
            </div>
            
            <div className="flex flex-wrap justify-center md:justify-end gap-4 sm:gap-6 text-xs sm:text-sm">
              <a href="#" className="text-gray-400 hover:text-blue-400 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition-colors">
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