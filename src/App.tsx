import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { useToast } from "./hooks/use-toast";
import { listenForForegroundMessages } from "./services/pushService";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import RealTimeNewsletter from "./pages/RealTimeNewsletter";

// Import AOS for animations
import AOS from 'aos';
import 'aos/dist/aos.css';
import ParkingManagement from "./pages/products/ParkingManagement";
import ParkingGuidance from "./pages/products/ParkingGuidance";
import BarrierGates from "./pages/products/BarrierGates";
import PedestrianGates from "./pages/products/PedestrianGates";
import AccessControl from "./pages/products/AccessControl";
import BiometricSystem from "./pages/products/access-control/BiometricSystem";
import RFIDSystem from "./pages/products/access-control/RFIDSystem";
import MobileSystem from "./pages/products/access-control/MobileSystem";
import KeypadSystem from "./pages/products/access-control/KeypadSystem";
import VayAccess from "./pages/VayAccess";
import Services from "./pages/Services";
import Products from "./pages/Products";
import Solutions from "./pages/Solutions";
import Features from "./pages/Features";
import SmartParking from "./pages/features/SmartParking";
import CommunityAccess from "./pages/features/CommunityAccess";
import MobileApp from "./pages/features/MobileApp";
import ComprehensiveServices from "./pages/features/ComprehensiveServices";
import About from "./pages/About";
import Mockups from "./pages/Mockups";
import ANPRTechnology from "./pages/solutions/ANPRTechnology";
import CloudPlatform from "./pages/solutions/CloudPlatform";
import AnalyticsReporting from "./pages/solutions/AnalyticsReporting";
import RevenueManagement from "./pages/solutions/RevenueManagement";
import CookieConsent from "./components/CookieConsent";
import Contact from "./components/Contact";
import LoadingScreen from "./components/LoadingScreen";
// import NearbyParkingLocations from './components/NearbyParkingLocations';


const queryClient = new QueryClient();

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize AOS with simple, professional animations
    AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: true,
      offset: 100,
      delay: 100
    });

    // Refresh AOS when needed
    AOS.refresh();

    // Simulate loading time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    // Listen for foreground push messages and show a toast
    listenForForegroundMessages((payload) => {
      const title = payload?.notification?.title || 'Update available';
      const body = payload?.notification?.body || 'There is a new update.';
      const link = payload?.fcmOptions?.link || payload?.data?.url || '/';
      toast({ title, description: body });
      // Optionally navigate automatically:
      // window.location.assign(link);
    });

    // Auto-publish announcements when site loads (idempotent by version)
    // 1) Try updates.json for latest article/update meta (no dashboard)
    // 2) Fallback to env-based config
    (async () => {
      try {
        const noCacheUrl = `/updates.json?ts=${Date.now()}`;
        const resp = await fetch(noCacheUrl, { cache: 'no-store' });
        if (resp.ok) {
          const u = await resp.json().catch(() => ({} as any));
          const version = u.version || '';
          const title = u.title || '';
          const body = u.body || '';
          const link = u.link || '/';
          if (version && title && body) {
            const { autoPublishUpdate } = await import('./services/newsletterBackend');
            await autoPublishUpdate(version, title, body, link);
            return;
          }
        }
      } catch (_) { /* ignore and fallback */ }

      // Fallback to env-based values
      try {
        const version = (import.meta as any).env.VITE_SITE_VERSION || '';
        const title = (import.meta as any).env.VITE_UPDATE_TITLE || '';
        const body = (import.meta as any).env.VITE_UPDATE_BODY || '';
        const link = (import.meta as any).env.VITE_UPDATE_LINK || '/';
        if (version && title && body) {
          const { autoPublishUpdate } = await import('./services/newsletterBackend');
          await autoPublishUpdate(version, title, body, link);
        }
      } catch (e) {
        console.info('Auto-publish skipped or failed:', e instanceof Error ? e.message : String(e));
      }
    })();

    return () => clearTimeout(timer);
  }, [toast]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/vayaccess" element={<VayAccess />} />
          <Route path="/services" element={<Services />} />
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/products" element={<Products />} />
          <Route path="/features" element={<Features />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/mockups" element={<Mockups />} />
          <Route path="/features/smart-parking" element={<SmartParking />} />
          <Route path="/features/community-access" element={<CommunityAccess />} />
          <Route path="/features/mobile-app" element={<MobileApp />} />
          <Route path="/features/comprehensive-services" element={<ComprehensiveServices />} />
          <Route path="/products/parking-management" element={<ParkingManagement />} />
          <Route path="/products/parking-guidance" element={<ParkingGuidance />} />
          <Route path="/products/barrier-gates" element={<BarrierGates />} />
          <Route path="/products/pedestrian-gates" element={<PedestrianGates />} />
          <Route path="/products/access-control" element={<AccessControl />} />
          <Route path="/products/access-control/biometric-system" element={<BiometricSystem />} />
          <Route path="/products/access-control/rfid-system" element={<RFIDSystem />} />
          <Route path="/products/access-control/mobile-system" element={<MobileSystem />} />
          <Route path="/products/access-control/keypad-system" element={<KeypadSystem />} />
          <Route path="/solutions/anpr-technology" element={<ANPRTechnology />} />
          <Route path="/solutions/cloud-platform" element={<CloudPlatform />} />
          <Route path="/solutions/analytics-reporting" element={<AnalyticsReporting />} />
          <Route path="/solutions/revenue-management" element={<RevenueManagement />} />
          {/* <Route path="/find-parking" element={<NearbyParkingLocations />} /> */}
          
          {/* Admin routes removed: auto-publish flow handles newsletters without UI */}

          <Route path="/real-time-newsletter" element={<RealTimeNewsletter />} />

          {/* Catch-all must be last */}
          <Route path="*" element={<NotFound />} />
        </Routes>
          <CookieConsent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
