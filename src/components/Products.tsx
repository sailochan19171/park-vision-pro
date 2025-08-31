import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { CheckCircle, ArrowRight } from "lucide-react";

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
  const [clickedProduct, setClickedProduct] = useState<string | null>(null);

  const handleProductView = (productName: string) => {
    // Show immediate feedback
    setClickedProduct(productName);
    
    // Reset feedback after 1 second
    setTimeout(() => {
      setClickedProduct(null);
    }, 1000);

    // Navigate to products page
    navigate('/products');

    toast({
      title: "Redirecting to Products",
      description: "View all our products and solutions.",
    });
  };

  const products = [
    {
      id: "smart-barrier-20",
      name: "Ticketless Parking Management System",
      image: smartParkingBarrier20,
      description:
        "Our goal is to simplify parking management and create a seamless experience for users, operators, and owners. We offer ticketless parking management system that not only manage parking but also optimize space usage, striking the ideal balance that leads to happier customers and a more profitable operation.",
      price: "₹1,85,000+",
    },
    {
      id: "management-kiosk",
      name: "Ticket Based Parking Management",
      image: kioskTerminal22,
      description:
        "A parking ticket dispenser plays a major component in automated car parking management systems, commonly found at the entry points of parking facilities such as malls, airports, and commercial complexes. These devices streamline the process of issuing tickets to vehicles entering the parking area, enabling efficient management of parking spaces.",
      price: "₹1,25,000+",
    },
    {
      id: "vay-parking-guidance-display",
      name: "VAY Parking Guidance Display",
      image: vayParkingGuidanceDisplay23,
      description:
        "Advanced guidance display with LED indicators showing real-time parking availability and navigation information. Enhanced overall safety and security with improved user experience.",
      price: "₹85,000+",
    },
    {
      id: "vay-parking-barrier-gate",
      name: "VAY Parking Barrier Gate",
      image: barrierGate13,
      description:
        "Advanced parking barrier gate with smart access control integration. Features weatherproof design with anti-crash mechanism and remote monitoring capabilities for modern parking facilities.",
      price: "₹2,15,000+",
    },
    {
      id: "access-barrier-12",
      name: "Professional Access Control",
      image: smartAccessBarrier12,
      description:
        "Professional-grade barrier with LED display and full access control integration. Weatherproof design supports boom light, safety photocells, and ANPR system integration for comprehensive parking management.",
      price: "₹2,25,000+",
    },
    // New product (content-change trigger)
    {
      id: "smart-parking-suite",
      name: "VAY Smart Parking Suite",
      image: vayParkingBarrierGate10,
      description:
        "End-to-end smart parking software suite combining ANPR, guidance, digital payments, and admin dashboard for multi-site operations.",
      price: "Custom",
    },
  ];

  return (
    <section id="products" className="py-12 sm:py-16 bg-gray-50 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blue curved shapes like in screenshot */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-900 rounded-full opacity-10 transform translate-x-48 -translate-y-48"></div>
        <div className="absolute top-1/3 left-0 w-80 h-80 bg-slate-300 rounded-full opacity-15 transform -translate-x-40"></div>
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-blue-900 rounded-full opacity-10 transform translate-y-36"></div>
      </div>

      <div className="container mx-auto px-2 sm:px-4 lg:px-6 max-w-6xl relative z-10">
        
        {/* Header Section */}
        <div className="text-center mb-16" data-aos="fade-up">
          <div className="inline-block mb-8">
            <span className="text-orange-500 text-sm font-semibold tracking-[0.2em] uppercase font-poppins">
              OUR PRODUCTS ——
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight font-poppins" data-aos="fade-up" data-aos-delay="100">
            Building Tomorrow's
            <br />
            <span className="text-blue-900">Solutions</span>
          </h1>
        </div>

        {/* Products Sections */}
        <div className="space-y-12 sm:space-y-16">
          {products.map((product, idx) => (
            <div key={product.id} className="relative mx-0 sm:mx-2 lg:mx-4">
              {/* Background decorative shapes for each product */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {idx % 2 === 0 ? (
                  <div className="absolute top-1/2 right-0 w-64 h-64 bg-blue-900 rounded-full opacity-8 transform translate-x-32 -translate-y-32"></div>
                ) : (
                  <div className="absolute top-1/2 left-0 w-64 h-64 bg-slate-300 rounded-full opacity-12 transform -translate-x-32 -translate-y-32"></div>
                )}
              </div>

              <div className={`grid lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 items-center min-h-[350px] ${
                idx % 2 === 1 ? 'lg:grid-flow-col-dense' : ''
              }`}>
                
                {/* Text Content Section */}
                <div className={`space-y-4 sm:space-y-6 ${idx % 2 === 1 ? 'lg:col-start-2' : ''}`} data-aos={idx % 2 === 0 ? "fade-right" : "fade-left"} data-aos-delay="200">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-900 leading-tight font-poppins">
                    {product.name}
                  </h2>
                  
                  <p className="text-gray-700 text-sm sm:text-base leading-relaxed font-poppins font-normal">
                    {product.description}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <Button 
                      onClick={() => handleProductView(product.name)}
                      className={`${
                        clickedProduct === product.name 
                          ? "bg-green-600 hover:bg-green-700" 
                          : "bg-blue-900 hover:bg-blue-800"
                      } text-white px-6 py-2.5 text-base font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 font-poppins`}
                    >
                      {clickedProduct === product.name ? (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          Redirecting...
                        </>
                      ) : (
                        <>
                          Learn More
                          <ArrowRight className="h-5 w-5" />
                        </>
                      )}
                    </Button>
                    
                    <Button 
                      variant="outline"
                      onClick={() => handleProductView(`${product.name} Quote`)}
                      className="border-2 border-blue-900 text-blue-900 hover:bg-blue-900 hover:text-white px-6 py-2.5 text-base font-medium rounded-lg transition-all duration-300 font-poppins"
                    >
                      Get Quote
                    </Button>
                  </div>
                </div>

                {/* Image Section - No white spaces, full width */}
                <div className={`relative flex justify-center items-center ${idx % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}`} data-aos={idx % 2 === 0 ? "fade-left" : "fade-right"} data-aos-delay="300">
                  <div className="relative w-full">
                    {/* Clean image container without white backgrounds */}
                    <div className="relative image-container w-full">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-auto object-contain perfect-image transform hover:scale-105 transition-transform duration-300 rounded-lg shadow-lg mx-auto"
                        loading="lazy"
                        style={{
                          filter: 'brightness(1.02) contrast(1.05) saturate(1.05)',
                          minHeight: '250px',
                          maxHeight: '400px',
                          backgroundColor: 'transparent',
                          display: 'block'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA Section */}
        {/* <div className="text-center mt-32 pt-16 border-t border-gray-200"> */}
          {/* <div className="inline-block mb-6"> */}
            {/* <span className="text-orange-500 text-sm font-semibold tracking-[0.2em] uppercase">
              OUR PROJECTS ——
            </span> */}
          </div>
          
          {/* <h3 className="text-4xl font-bold text-blue-900 mb-8">
            Ready to Transform Your Parking Experience?
          </h3> */}
          
          {/* <p className="text-gray-700 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
            Let our experts help you choose the perfect combination of products for your specific needs and create a comprehensive parking management solution.
          </p> */}
          
          {/* <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => handleProductView("Complete Solution Package")}
              className={`${
                clickedProduct === "Complete Solution Package" 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-blue-900 hover:bg-blue-800"
              } text-white px-10 py-4 text-lg font-medium rounded-lg transition-all duration-300`}
            >
              {clickedProduct === "Complete Solution Package" ? (
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Redirecting...
                </span>
              ) : (
                'View All Projects'
              )}
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => handleProductView("Consultation")} */}
              // className="border-2 border-blue-900 text-blue-900 hover:bg-blue-900 hover:text-white px-10 py-4 text-lg font-medium rounded-lg transition-all duration-300"
            // 
              {/* Schedule Consultation */}
            {/* </Button> */}
          {/* </div> */}
        {/* </div> */}
      {/* </div> */}
    </section>
  );
};

export default Products;