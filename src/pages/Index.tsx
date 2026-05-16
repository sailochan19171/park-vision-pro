import { useEffect } from "react";
import Header from "../components/Header";
import Hero from "../components/Hero";
import AnimatedBarrierDemo from "../components/AnimatedBarrierDemo";
import Solutions from "../components/Solutions";
import FeaturedProducts from "../components/FeaturedProducts";
import ProductsGrid from "../components/ProductsGrid";
import About from "../components/About";
import CTASection from "../components/CTASection";
import Contact from "../components/Contact";
// import NearbyParkingLocations from "../components/NearbyParkingLocations";
import Footer from "../components/Footer";
import EnhancedChatbot from "../components/EnhancedChatbot";
import ScrollToTopButton from "../components/ScrollToTopButton";
// import ChatbotDemo from "../components/ChatbotDemo";

const Index = () => {
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    
    // Enhanced smooth scrolling for anchor links with header offset
    const handleSmoothScroll = (e: Event) => {
      const target = e.target as HTMLAnchorElement;
      if (target.hash) {
        e.preventDefault();
        const element = document.querySelector(target.hash);
        if (element) {
          const headerHeight = 80; // Account for header height
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }
    };

    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => link.addEventListener('click', handleSmoothScroll));

    return () => {
      links.forEach(link => link.removeEventListener('click', handleSmoothScroll));
    };
  }, []);

  return (
    <div className="min-h-screen bg-white w-full">
      <Header />
      <main className="w-full">
        <Hero />
        <Solutions />
        <FeaturedProducts />
        <ProductsGrid />
        <About />
        <CTASection />
        <Contact />
      </main>
      <Footer />
      <EnhancedChatbot />
      <ScrollToTopButton />
    </div>
  );
};

export default Index;
