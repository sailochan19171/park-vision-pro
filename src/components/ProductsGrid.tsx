import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { ArrowRight } from "lucide-react";

// Image imports - Updated with new VAY branded images
import smartParkingBarrier20 from "../assets/11.jpg";
import smartAccessBarrier12 from "../assets/12.jpg";
import vayParkingBarrierGate10 from "../assets/vay-parking-barrier-gate-10.jpg";
import kioskTerminal22 from "../assets/22-removebg-preview.png";
import vayParkingGuidanceDisplay23 from "../assets/vay-parking-guidance-display-23.jpg";
import barrierGate13 from "../assets/13-removebg-preview.png";
import barrierGate20 from "../assets/20-removebg-preview.png";

interface ProductsProps {
  showPrices?: boolean;
}

const Products: React.FC<ProductsProps> = ({ showPrices = true }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Removed clickedProduct state since buttons are removed
  const [scrollY, setScrollY] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Enhanced parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
      // Debug log to confirm parallax is working
      if (window.scrollY % 100 === 0) {
        console.log('🎯 Parallax Active - Scroll Y:', window.scrollY);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Intersection Observer for animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: '50px 0px -50px 0px'
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  // Removed handleProductView function since buttons are removed

  const products = [
    {
      id: "smart-barrier-20",
      name: "VAY Smart Parking Barrier System",
      image: smartParkingBarrier20,
      description:
        "Heavy-duty automated barrier system featuring robust construction with intelligent LED guidance technology and advanced smart parking control integration.",
      extra:
        "Advanced RFID authentication support with comprehensive remote monitoring capabilities and real-time status updates. Engineered for high-performance operation in commercial complexes, residential communities, and industrial facilities requiring secure vehicular access management.",

    },
    {
      id: "vay-parking-barrier-gate",
      name: "VAY Parking Barrier Gate",
      image: barrierGate13,
      description:
        "Advanced parking barrier gate system with comprehensive smart access control integration for enhanced security management.",
      extra:
        "Engineered with weatherproof construction featuring advanced anti-crash safety mechanism, intelligent sensor technology, and comprehensive remote monitoring capabilities for seamless operation in all environmental conditions.",

    },
    {
      id: "barrier-gate-20",
      name: "VAY Multi-Lane Barrier System",
      image: barrierGate20,
      description:
        "Professional-grade multi-barrier system engineered with advanced smart parking control technology specifically designed for high-traffic commercial and industrial environments.",
      extra:
        "Features distinctive orange safety design with multiple synchronized access lanes, integrated payment processing systems, and real-time traffic flow management capabilities for optimal operational efficiency.",

    },
    {
      id: "access-barrier-12",
      name: "VAY Smart Access Barrier Gate",
      image: smartAccessBarrier12,
      description:
        "Professional-grade smart access barrier featuring integrated LED display technology and comprehensive access control system integration for enhanced security management.",
      extra:
        "Weatherproof construction with advanced boom light indicators, intelligent safety photocell sensors, and seamless ANPR (Automatic Number Plate Recognition) system integration for complete vehicular access automation.",

    },
    {
      id: "parking-gate-11",
      name: "VAY Parking Barrier Gate",
      image: vayParkingBarrierGate10,
      description:
        "Advanced parking barrier gate system specifically optimized for parking facilities with intelligent control systems and reliable operation.",
      extra: "Features advanced control integration, weatherproof construction, and comprehensive monitoring capabilities. Perfect for commercial complexes, residential communities, and professional parking management solutions.",

    },
    {
      id: "management-kiosk",
      name: "VAY Parking Management Kiosk",
      image: kioskTerminal22,
      description:
        "Advanced self-service parking management kiosk featuring comprehensive payment processing options, digital ticketing system, and seamless cloud integration for modern parking facilities.",
      extra: "Equipped with high-resolution touchscreen interface, thermal receipt printing capabilities, and support for multiple payment gateways including credit cards, mobile payments, and digital wallets for enhanced user convenience.",

    },
    {
      id: "guidance-system",
      name: "VAY Parking Guidance Display",
      image: vayParkingGuidanceDisplay23,
      description:
        "Advanced LED display system providing real-time parking space availability information and intelligent directional guidance for enhanced user navigation and facility management.",
      extra:
        "Features comprehensive sensor network compatibility with advanced mobile app integration for smart parking management. Provides clear visibility in all lighting conditions with energy-efficient LED technology and customizable display options.",

    },
  ];

  return (
    <section ref={sectionRef} id="products" className="py-24 bg-white relative overflow-hidden">
      {/* Dynamic Parallax Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none max-w-full">
        {/* Floating Geometric Shapes with Parallax */}
        <div 
          className="absolute top-20 right-20 w-24 h-24 border-2 border-blue-300 rounded-lg rotate-45 opacity-40"
          style={{
            transform: `translate3d(${scrollY * 0.1}px, ${scrollY * 0.05}px, 0) rotate(${45 + scrollY * 0.02}deg)`,
            willChange: 'transform'
          }}
        ></div>
        
        <div 
          className="absolute top-1/3 left-10 w-20 h-20 border-2 border-orange-400 rounded-full opacity-50"
          style={{
            transform: `translate3d(${-scrollY * 0.12}px, ${scrollY * 0.08}px, 0) scale(${1 + Math.sin(scrollY * 0.002) * 0.1})`,
            willChange: 'transform'
          }}
        ></div>
        
        <div 
          className="absolute bottom-1/4 right-1/3 w-16 h-16 bg-gradient-to-r from-blue-200 to-orange-200 rounded-full opacity-40"
          style={{
            transform: `translate3d(${scrollY * 0.15}px, ${-scrollY * 0.1}px, 0)`,
            willChange: 'transform'
          }}
        ></div>
        
        {/* Mouse-following elements */}
        <div 
          className="absolute top-1/2 left-1/2 w-8 h-8 bg-orange-300 rounded-full opacity-40"
          style={{
            transform: `translate3d(${mousePosition.x * 0.8 - 150}px, ${mousePosition.y * 0.6 - 80}px, 0)`,
            willChange: 'transform'
          }}
        ></div>
        
        <div 
          className="absolute top-3/4 left-1/4 w-12 h-12 border-2 border-blue-400 opacity-30"
          style={{
            transform: `translate3d(${mousePosition.x * 0.6 - 100}px, ${mousePosition.y * 0.4 - 60}px, 0) rotate(${mousePosition.x * 0.2}deg)`,
            willChange: 'transform'
          }}
        ></div>
        
        {/* Animated Lines */}
        <div 
          className="absolute top-40 left-1/2 w-1 h-32 bg-gradient-to-b from-transparent via-blue-400 to-transparent opacity-70"
          style={{
            transform: `translate3d(-50%, ${scrollY * 0.6}px, 0)`,
            willChange: 'transform'
          }}
        ></div>
        
        <div 
          className="absolute bottom-40 right-1/4 w-32 h-1 bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-70"
          style={{
            transform: `translate3d(${-scrollY * 0.4}px, 0, 0)`,
            willChange: 'transform'
          }}
        ></div>
        
        {/* Additional floating elements */}
        <div 
          className="absolute top-16 left-1/4 w-3 h-3 bg-blue-400 rounded-full opacity-80"
          style={{
            transform: `translate3d(${scrollY * 0.8}px, ${scrollY * 0.6}px, 0) scale(${1 + Math.cos(scrollY * 0.01) * 0.5})`,
            willChange: 'transform'
          }}
        ></div>
        
        <div 
          className="absolute bottom-16 left-1/3 w-4 h-4 bg-orange-400 rounded-full opacity-80"
          style={{
            transform: `translate3d(${-scrollY * 0.7}px, ${-scrollY * 0.5}px, 0) scale(${1 + Math.sin(scrollY * 0.008) * 0.3})`,
            willChange: 'transform'
          }}
        ></div>
        
        {/* Highly visible parallax indicator */}
        <div 
          className="absolute top-32 right-1/2 w-20 h-20 border-4 border-blue-500 rounded-full opacity-50 flex items-center justify-center"
          style={{
            transform: `translate3d(${scrollY * 0.6}px, ${scrollY * 0.4}px, 0) rotate(${scrollY * 0.2}deg)`,
            willChange: 'transform'
          }}
        >
          <div className="w-8 h-8 bg-orange-400 rounded-full"></div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        
        {/* Header Section */}
        <div className="text-center mb-16 sm:mb-20 md:mb-24 lg:mb-28 xl:mb-32">
          <div className="inline-block mb-4 sm:mb-6">
            <span className="text-orange-700 text-[20px] sm:text-[22px] font-semibold tracking-[0.2em] uppercase">
              OUR PRODUCTS
            </span>
          </div>
          
          <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 leading-tight">
            Make Your Parking
            <br />
            <span className="text-blue-900">Seamless</span>
          </h1>
        </div>

        {/* Products Sections */}
        <div className="space-y-16">
          {products.map((product, idx) => (
            <div key={product.id} className="relative mx-4 sm:mx-6 lg:mx-8">
              {/* Dynamic Product Parallax Effects */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none max-w-full">
                {idx % 2 === 0 ? (
                  <>
                    <div 
                      className="absolute top-10 right-10 w-16 h-16 border-2 border-blue-400 rounded-full opacity-60"
                      style={{
                        transform: `translate3d(${scrollY * 0.2 + idx * 20}px, ${scrollY * 0.15}px, 0) rotate(${scrollY * 0.3}deg)`,
                        willChange: 'transform'
                      }}
                    ></div>
                    <div 
                      className="absolute bottom-20 right-20 w-12 h-12 bg-orange-300 rounded-lg opacity-70"
                      style={{
                        transform: `translate3d(${scrollY * 0.25}px, ${-scrollY * 0.18}px, 0) rotate(${scrollY * 0.1}deg)`,
                        willChange: 'transform'
                      }}
                    ></div>
                    <div 
                      className="absolute top-1/2 right-5 w-6 h-6 bg-blue-300 rounded-full opacity-80"
                      style={{
                        transform: `translate3d(${scrollY * 0.35}px, ${scrollY * 0.25}px, 0) scale(${1 + Math.sin(scrollY * 0.01 + idx) * 0.3})`,
                        willChange: 'transform'
                      }}
                    ></div>
                  </>
                ) : (
                  <>
                    <div 
                      className="absolute top-20 left-10 w-14 h-14 border-2 border-orange-400 opacity-70"
                      style={{
                        transform: `translate3d(${-scrollY * 0.2}px, ${scrollY * 0.18 + idx * 15}px, 0) rotate(${-scrollY * 0.25}deg)`,
                        willChange: 'transform'
                      }}
                    ></div>
                    <div 
                      className="absolute bottom-10 left-20 w-10 h-10 bg-blue-300 rounded-full opacity-75"
                      style={{
                        transform: `translate3d(${scrollY * 0.3}px, ${scrollY * 0.2}px, 0) scale(${1 + Math.cos(scrollY * 0.008 + idx) * 0.4})`,
                        willChange: 'transform'
                      }}
                    ></div>
                    <div 
                      className="absolute top-1/2 left-5 w-8 h-8 bg-orange-300 rounded-lg opacity-80"
                      style={{
                        transform: `translate3d(${-scrollY * 0.28}px, ${scrollY * 0.22}px, 0) rotate(${scrollY * 0.15}deg)`,
                        willChange: 'transform'
                      }}
                    ></div>
                  </>
                )}
              </div>

              <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-6 sm:p-8 lg:p-10 shadow-sm border border-gray-100/50">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
                  
                  {/* Text Content Section - Mobile Optimized */}
                  <div className={`space-y-3 sm:space-y-4 ${idx % 2 === 1 ? 'lg:order-2' : 'lg:order-1'}`}>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-blue-900 leading-tight mb-3 sm:mb-6">
                    {product.name}
                  </h2>
                  
                  <p className="text-gray-700 text-sm leading-relaxed mb-2 sm:mb-4">
                    {product.description}
                  </p>
                  
                  <p className="text-gray-600 text-sm leading-relaxed mb-2 sm:mb-4">
                    {product.extra}
                  </p>
                  
                  <p className="text-gray-600 text-sm leading-relaxed hidden sm:block">
                    Professional-grade construction with advanced technology integration, designed for reliable 24/7 operation. 
                    Perfect for commercial facilities, residential complexes, and industrial installations requiring secure access control.
                  </p>

                  {/* Features List - Mobile Optimized */}
                  <div className="space-y-1 sm:space-y-2 mt-4">
                    {[
                      idx === 0 ? "Smart LED Indicators" : idx === 1 ? "Remote Monitoring" : idx === 2 ? "Multi-Lane Support" : idx === 3 ? "Weatherproof Design" : idx === 4 ? "Cost-Efficient Setup" : idx === 5 ? "Touchscreen Interface" : "Real-time Availability"
                    ].map((feature, featureIdx) => (
                      <div key={featureIdx} className="flex items-center space-x-2 sm:space-x-3">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                        <span className="text-gray-800 font-semibold text-xs sm:text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Removed buttons as requested */}
                </div>

                {/* Image Section with Parallax - Mobile Optimized */}
                <div className={`relative flex justify-center items-center mt-6 lg:mt-0 ${idx % 2 === 1 ? 'lg:order-1' : 'lg:order-2'}`}>
                  <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg">
                    {/* Clean image with subtle parallax movement */}
                    <div 
                      className="relative w-full h-[280px] sm:h-[320px] md:h-[380px] lg:h-[420px] xl:h-[480px] flex items-center justify-center p-2 sm:p-4"
                      style={{
                        transform: window.innerWidth >= 1024 
                          ? `translate3d(${scrollY * 0.01 * (idx % 2 === 0 ? 1 : -1)}px, ${scrollY * 0.015 * (idx % 2 === 0 ? 1 : -1)}px, 0)`
                          : 'none', // Disable parallax on mobile for better performance
                        willChange: window.innerWidth >= 1024 ? 'transform' : 'auto'
                      }}
                    >
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-contain hover:scale-105 transition-all duration-500 hover:drop-shadow-2xl"
                        loading="lazy"
                        style={{
                          filter: 'brightness(1.02) contrast(1.05) saturate(1.05)',
                          maxWidth: '100%',
                          maxHeight: '100%'
                        }}
                      />
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          ))}
        </div>


      </div>
    </section>
  );
};

export default Products;