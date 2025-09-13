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
    <div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full">
      <Header />
      <main className="overflow-x-hidden w-full max-w-full">
        <div className="container mx-auto px-6 lg:px-10">
          {/* Hero Section */}
          <section className="relative py-6 lg:py-8">
            <Hero />
          </section>
          
          {/* Core Solutions Overview */}
          <section className="relative bg-gradient-to-b from-white to-gray-50 py-8 lg:py-12">
            <Solutions />
          </section>
          
          {/* Section Divider */}
          <div className="h-16 bg-gradient-to-b from-gray-50 to-white"></div>
          
          {/* Featured Products Showcase */}
          <section className="relative bg-white py-8 lg:py-12">
            <FeaturedProducts />
          </section>
          
          {/* Section Divider */}
          <div className="h-12 bg-gradient-to-b from-white to-gray-50"></div>
          
          {/* Complete Product Catalog */}
          <section className="relative bg-gradient-to-b from-gray-50 to-white py-8 lg:py-12">
            <ProductsGrid />
          </section>
          
          {/* Section Divider */}
          <div className="h-16 bg-gradient-to-b from-white to-gray-50"></div>
          
          {/* Company Information */}
          <section className="relative bg-white py-8 lg:py-12">
            <About />
          </section>
          
          {/* Section Divider */}
          <div className="h-12 bg-gradient-to-b from-white to-gray-50"></div>
          
          {/* Call to Action */}
          <section className="relative bg-gradient-to-b from-gray-50 to-white py-8 lg:py-12">
            <CTASection />
          </section>
          
          {/* Section Divider */}
          <div className="h-12 bg-gradient-to-b from-white to-gray-50"></div>
          
          {/* Contact Information */}
          <section className="relative bg-white pb-8 lg:pb-12">
            <Contact />
          </section>
        </div>
      </main>
      <Footer />
      <EnhancedChatbot />
      <ScrollToTopButton />
    </div>
  );
};

export default Index;
